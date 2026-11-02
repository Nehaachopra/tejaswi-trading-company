import PDFDocument from "pdfkit";

import type { PaymentModel } from "../payment/model";
import { amountInWords } from "./amount-words";

// the page: the voucher's box, split like the voucher (1 part our details, 1.5 parts the rest)
const LEFT = 40;
const WIDTH = 515;
const SPLIT = 206;
const RIGHT = LEFT + WIDTH;
const MIDDLE = LEFT + SPLIT;
const AMOUNT = 110;
const PAD = 6;
const ROW = 19;
const CHESTNUT = "#3b1f14";
const SOFT = "#f3ece0";
const LINE = "#b9a99f";

// an amount with paise, Indian grouping, as on the voucher
const money = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dated = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" }).format(d).replaceAll("/", "-");
const half = (gst: number) => Math.round((gst / 2) * 100) / 100;
const titleCase = (v: string) => v.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

type Options = {
  version: number;
  // when this version was asked for: the PDF's own date, so the same version always makes the same file
  madeAt: Date;
  // a cancelled version carries the stamp and why
  cancelled: { reason: string | null } | null;
};

// a payment under reverse charge as a file: the payment voucher, laid out the same, doubling as our self-invoice.
// English only, as a document kept for the tax department
export function rcmSelfInvoice(p: PaymentModel, { version, madeAt, cancelled }: Options) {
  const rcm = p.rcm!;
  const tds = p.tdsAmount ?? 0;
  const total = Math.round((p.amount + tds + rcm.gst) * 100) / 100;
  const pdf = new PDFDocument({ size: "A4", margin: LEFT, info: { Title: `${p.assignedId} v${version}`, CreationDate: madeAt, ModDate: madeAt } });
  const chunks: Buffer[] = [];
  pdf.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
  });

  const line = (x1: number, y1: number, x2: number, y2: number) => pdf.moveTo(x1, y1).lineTo(x2, y2).strokeColor(LINE).lineWidth(0.6).stroke();
  // words at a spot, in a width
  const write = (words: string, x: number, y: number, width: number, o: { bold?: boolean; align?: "left" | "right" | "center"; size?: number; color?: string } = {}) => {
    pdf.font(o.bold ? "Helvetica-Bold" : "Helvetica").fontSize(o.size ?? 9).fillColor(o.color ?? CHESTNUT).text(words, x, y, { width, align: o.align ?? "left", lineBreak: true });
  };
  const tall = (words: string, width: number, bold = false) => pdf.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).heightOfString(words, { width });
  // a filled band with a heading, then lines under it; gives back where it ended
  const band = (heading: string, lines: string[], top: number, width: number) => {
    pdf.rect(LEFT, top, width, ROW + 2).fill(CHESTNUT);
    write(heading, LEFT + PAD, top + 6, width - PAD * 2, { bold: true, size: 10, color: "#ffffff" });
    let y = top + ROW + 7;
    for (const l of lines) {
      write(l, LEFT + PAD, y, width - PAD * 2);
      y += tall(l, width - PAD * 2) + 2.5;
    }
    return y + 3;
  };

  // the title, as on the voucher
  write("Payment Voucher and Self-invoice", LEFT, 40, WIDTH, { bold: true, size: 15, align: "center" });
  const boxTop = 64;

  // our details on the left, the voucher's on the right
  const ours = band(p.company.name, [p.company.address, `Phone: ${p.company.phone}`, `Email: ${p.company.email}`, `State: ${p.company.state} Code: ${p.company.stateCode}`, `GSTIN : ${p.company.gstin}`, `FSSAI No : ${p.company.fssai}`], boxTop, SPLIT);
  line(LEFT, ours, MIDDLE, ours);
  write(`Subject to ${p.company.jurisdiction} JURISDICTION`, LEFT + PAD, ours + 6, SPLIT - PAD * 2, { bold: true });
  const firstEnd = ours + ROW;
  const columns = [MIDDLE, MIDDLE + 84, MIDDLE + 188, MIDDLE + 232, RIGHT];
  const details: [string, string, string, string][] = [
    ["Voucher No", p.assignedId, "Dated", dated(new Date(p.dateTime))],
    ["Paid for", "Expense", "Mode", p.settledIn === "cash" ? "Cash" : "Bank"],
    ["Reference / UTR", p.referenceNumber ?? "-", "Dated", p.referenceNumber ? dated(new Date(p.dateTime)) : "-"],
    ["Self-invoice No", p.assignedId, "RCM", "Yes"],
    ["Place of supply", `${p.company.state} (${p.company.stateCode})`, "SAC", rcm.sac],
  ];
  details.forEach((d, i) => {
    const y = boxTop + i * ROW;
    d.forEach((v, c) => write(v, columns[c]! + PAD, y + 6, columns[c + 1]! - columns[c]! - PAD - 2, { bold: i === 0 && c === 1 }));
    line(MIDDLE, y + ROW, RIGHT, y + ROW);
    for (const x of columns.slice(1, 4)) line(x, y, x, y + ROW);
  });

  // who it went to, with the remarks beside it
  line(LEFT, firstEnd, RIGHT, firstEnd);
  const short = p.party?.shortName;
  const name = titleCase(p.party?.name ?? p.paidToName);
  const paidToEnd = band(`Paid to: ${short ?? name}`, [...(short ? [name] : []), ...(p.tdsPan ? [`PAN : ${p.tdsPan}`] : []), rcm.supplierGstin ? `GSTIN : ${rcm.supplierGstin}` : "Unregistered, no GSTIN", ...(p.partyPhone ? [`Phone: +91 ${p.partyPhone}`] : [])], firstEnd, SPLIT);
  write("Remarks:", MIDDLE + PAD, firstEnd + 7, 200, { bold: true });
  write(p.remarks ?? "-", MIDDLE + PAD, firstEnd + 20, WIDTH - SPLIT - PAD * 2);
  const secondEnd = Math.max(paidToEnd, firstEnd + 44);
  line(MIDDLE, boxTop, MIDDLE, secondEnd);
  line(LEFT, secondEnd, RIGHT, secondEnd);

  // the particulars: the taxable value, with the service code
  const sl = LEFT + 34;
  const amountAt = RIGHT - AMOUNT;
  const sacAt = amountAt - 58;
  write("Sl", LEFT + PAD, secondEnd + 6, 24, { bold: true });
  write("Particulars", sl + PAD, secondEnd + 6, 300, { bold: true });
  write("SAC", sacAt + PAD, secondEnd + 6, 46, { bold: true });
  write("Taxable value (Rs)", amountAt + PAD, secondEnd + 6, AMOUNT - PAD * 2, { bold: true, align: "right" });
  const headEnd = secondEnd + ROW;
  line(LEFT, headEnd, RIGHT, headEnd);
  const words = titleCase(p.paidToName);
  write("1", LEFT + PAD, headEnd + 6, 24);
  write(words, sl + PAD, headEnd + 6, sacAt - sl - PAD * 2);
  write(rcm.sac, sacAt + PAD, headEnd + 6, 46);
  write(money(rcm.taxable), amountAt + PAD, headEnd + 6, AMOUNT - PAD * 2, { align: "right" });
  // room below the lines, as on the voucher
  const tableEnd = headEnd + 12 + tall(words, sacAt - sl - PAD * 2) + 26;
  line(sl, secondEnd, sl, tableEnd);
  line(sacAt, secondEnd, sacAt, tableEnd);
  line(amountAt, secondEnd, amountAt, tableEnd);
  line(LEFT, tableEnd, RIGHT, tableEnd);

  // where it was paid from, and how the amount paid was reached
  const from: [string, string][] = p.settledIn === "bank" && p.bank
    ? [["Paid from", titleCase(p.bank.name)], ["A/c Number", `**** ${p.bank.last4}`], ["IFSC code", p.bank.ifsc ?? "-"]]
    : [["Paid from", "Cash"]];
  from.forEach(([label, value], i) => {
    const y = tableEnd + i * ROW;
    write(label, LEFT + PAD, y + 6, 66);
    write(value, LEFT + 72 + PAD, y + 6, SPLIT - 72 - PAD * 2);
    if (i < from.length - 1) line(LEFT, y + ROW, MIDDLE, y + ROW);
  });
  line(LEFT + 72, tableEnd, LEFT + 72, tableEnd + from.length * ROW);
  const sums: [string, string, boolean][] = [
    ...(tds > 0 ? ([["Taxable value", money(rcm.taxable), false], [`Less TDS ${p.tdsRate ?? 0}%`, `(${money(tds)})`, false]] as [string, string, boolean][]) : []),
    ["Amount paid Rs.", money(p.amount), true],
  ];
  sums.forEach(([label, value, bold], i) => {
    const y = tableEnd + i * ROW;
    write(label, MIDDLE + PAD, y + 6, amountAt - MIDDLE - PAD * 2, { bold, align: "right" });
    write(value, amountAt + PAD, y + 6, AMOUNT - PAD * 2, { bold, align: "right" });
    if (i < sums.length - 1) line(MIDDLE, y + ROW, RIGHT, y + ROW);
  });
  const sumsEnd = tableEnd + Math.max(from.length, sums.length) * ROW;
  line(MIDDLE, tableEnd, MIDDLE, sumsEnd);
  line(amountAt, tableEnd, amountAt, tableEnd + sums.length * ROW);
  line(LEFT, sumsEnd, RIGHT, sumsEnd);

  // each tax: its basis, rate, what it's on, and where it goes
  pdf.rect(LEFT, sumsEnd, WIDTH, ROW).fill(SOFT);
  write("Tax breakdown", LEFT + PAD, sumsEnd + 6, 200, { bold: true });
  const taxTop = sumsEnd + ROW;
  line(LEFT, taxTop, RIGHT, taxTop);
  const at = [LEFT, LEFT + 46, LEFT + 136, LEFT + 180, LEFT + 262, LEFT + 344, RIGHT];
  const cells = (y: number, row: string[], bold = false) =>
    row.forEach((v, i) => write(v, at[i]! + PAD, y + 6, at[i + 1]! - at[i]! - PAD * 2, { bold, align: i >= 2 && i <= 4 ? "right" : "left" }));
  cells(taxTop, ["Tax", "Basis", "Rate", "On (Rs)", "Amount (Rs)", "Goes to"], true);
  line(LEFT, taxTop + ROW, RIGHT, taxTop + ROW);
  const gstRows = rcm.otherState ? [["IGST", rcm.rate, rcm.gst]] : [["CGST", rcm.rate / 2, half(rcm.gst)], ["SGST", rcm.rate / 2, half(rcm.gst)]];
  const taxes: string[][] = [
    ...(tds > 0 ? [["TDS", "", `${p.tdsRate ?? 0}%`, money(Math.round((tds / (p.tdsRate || 1)) * 10000) / 100), money(tds), "Income tax"]] : []),
    ...gstRows.map(([tax, rate, amount]) => [String(tax), "Reverse charge", `${rate}%`, money(rcm.taxable), money(Number(amount)), "GST, input credit once paid"]),
  ];
  taxes.forEach((row, i) => cells(taxTop + ROW * (i + 1), row));
  const footTop = taxTop + ROW * (taxes.length + 1);
  line(LEFT, footTop, RIGHT, footTop);
  write("Tax to deposit", LEFT + PAD, footTop + 6, 200, { bold: true });
  write(money(tds + rcm.gst), at[4]! + PAD, footTop + 6, at[5]! - at[4]! - PAD * 2, { bold: true, align: "right" });
  const taxEnd = footTop + ROW;
  for (const x of at.slice(1, 6)) line(x, taxTop, x, footTop);
  line(at[4]!, footTop, at[4]!, taxEnd);
  line(at[5]!, footTop, at[5]!, taxEnd);
  line(LEFT, taxEnd, RIGHT, taxEnd);

  // what it all comes to
  const strip: [string, string][] = [
    [rcm.service === "rent" ? "Paid to landlord" : "Amount paid", money(p.amount)],
    ...(tds > 0 ? ([[`TDS ${p.tdsRate ?? 0}%`, money(tds)]] as [string, string][]) : []),
    [`RCM GST ${rcm.rate}%`, money(rcm.gst)],
    ["Total", money(total)],
  ];
  const stripWidth = WIDTH / strip.length;
  const stripHeight = 36;
  strip.forEach(([label, value], i) => {
    const x = LEFT + i * stripWidth;
    const last = i === strip.length - 1;
    if (last) pdf.rect(x, taxEnd, stripWidth, stripHeight).fill(CHESTNUT);
    else if (i > 0) line(x, taxEnd, x, taxEnd + stripHeight);
    write(label, x + PAD, taxEnd + 6, stripWidth - PAD * 2, { size: 8, color: last ? "#ffffff" : CHESTNUT });
    write(`Rs. ${value}`, x + PAD, taxEnd + 18, stripWidth - PAD * 2, { bold: true, size: 11, color: last ? "#ffffff" : CHESTNUT });
  });
  const stripEnd = taxEnd + stripHeight;
  line(LEFT, stripEnd, RIGHT, stripEnd);

  // the total in words
  const label = LEFT + 126;
  write("Total in words (Rupees)", LEFT + PAD, stripEnd + 6, 118, { bold: true });
  write(amountInWords(total), label + PAD, stripEnd + 6, RIGHT - label - PAD * 2);
  line(label, stripEnd, label, stripEnd + ROW);
  const boxEnd = stripEnd + ROW;
  pdf.rect(LEFT, boxTop, WIDTH, boxEnd - boxTop).strokeColor(LINE).lineWidth(0.6).stroke();

  // under the box, as on the voucher
  write("This is a computer generated voucher.", LEFT, boxEnd + 8, WIDTH, { bold: true });
  write(`Stored copy, version ${version}${cancelled ? `. Cancelled${cancelled.reason ? `: ${cancelled.reason}` : ""}` : ""}`, LEFT, boxEnd + 21, WIDTH, { size: 8 });
  const signs = boxEnd + 62;
  write(`Paid by: ${p.createdByName}`, LEFT, signs, 170);
  write("Authorised Signatory", LEFT, signs, WIDTH, { bold: true, align: "center" });
  write("Receiver's signature", LEFT, signs, WIDTH, { bold: true, align: "right" });

  // the stamp across a cancelled one
  if (cancelled) {
    pdf.save().rotate(-30, { origin: [297, 400] }).fillColor("#a11d1d").opacity(0.25).font("Helvetica-Bold").fontSize(72).text("CANCELLED", LEFT, 370, { width: WIDTH, align: "center" });
    pdf.restore();
  }

  pdf.end();
  return done;
}

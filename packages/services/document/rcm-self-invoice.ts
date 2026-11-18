import PDFDocument from "pdfkit";

import type { PaymentModel } from "../payment/model";
import { amountInWords } from "./amount-words";

// the page: the voucher's box, split like the voucher (1 part our details, 1.5 parts the rest); the last column as
// wide as the breakup's figures
const LEFT = 40;
const WIDTH = 515;
const SPLIT = 206;
const RIGHT = LEFT + WIDTH;
const MIDDLE = LEFT + SPLIT;
const AMOUNT = 110;
const PAD = 6;
const ROW = 19;
const CHESTNUT = "#3b1f14";
const LINE = "#b9a99f";
// how a bank part was paid, as the voucher names it
const MODES: Record<string, string> = { upi: "UPI", imps: "IMPS", neftRtgs: "NEFT / RTGS", cheque: "Cheque" };

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

  // the title centred, with the jurisdiction on its line at the left, as on the voucher
  write(`Subject to ${p.company.jurisdiction} JURISDICTION`, LEFT, 47, 170, { bold: true, size: 8 });
  write("Payment Voucher and Self-invoice", LEFT, 40, WIDTH, { bold: true, size: 15, align: "center" });
  const boxTop = 64;

  // our details on the left
  const ours = band(p.company.name, [p.company.address, `Phone: ${p.company.phone}`, `Email: ${p.company.email}`, `State: ${p.company.state} Code: ${p.company.stateCode}`, `GSTIN : ${p.company.gstin}`, `FSSAI No : ${p.company.fssai}`], boxTop, SPLIT);
  // the voucher's details on the right, the remarks under their last row
  const columns = [MIDDLE, MIDDLE + 84, MIDDLE + 188, MIDDLE + 232, RIGHT];
  const mode = (m: string | null) => (m ? MODES[m] ?? m : "-");
  const details: [string, string, string, string][] = [
    ["Voucher No", p.assignedId, "Dated", dated(new Date(p.dateTime))],
    ["Paid for", "Expense", "Mode", p.settledIn === "cash" ? "Cash" : p.settledIn === "cashAndBank" ? "Cash + Bank" : mode(p.bankMode)],
    ["Self-invoice No", p.assignedId, "RCM", "Yes"],
    ["Place of supply", `${p.company.state} (${p.company.stateCode})`, "SAC", rcm.sac],
  ];
  details.forEach((d, i) => {
    const y = boxTop + i * ROW;
    d.forEach((v, c) => write(v, columns[c]! + PAD, y + 6, columns[c + 1]! - columns[c]! - PAD - 2, { bold: i === 0 && c === 1 }));
    line(MIDDLE, y + ROW, RIGHT, y + ROW);
    for (const x of columns.slice(1, 4)) line(x, y, x, y + ROW);
  });
  const remarksTop = boxTop + details.length * ROW;
  const remarks = `Remarks: ${p.remarks ?? "-"}`;
  write(remarks, MIDDLE + PAD, remarksTop + 6, WIDTH - SPLIT - PAD * 2);
  const firstEnd = Math.max(ours, remarksTop + tall(remarks, WIDTH - SPLIT - PAD * 2) + 12);
  line(MIDDLE, boxTop, MIDDLE, firstEnd);
  line(LEFT, firstEnd, RIGHT, firstEnd);

  // who it went to, the full width, by their full name
  const name = titleCase(p.party?.name ?? p.paidToName);
  const address = p.party?.address;
  const paidToEnd = band(
    `Paid to: ${name}`,
    [
      ...(address ? [[address.line1, address.line2, `${address.city} - ${address.postalCode}`].filter(Boolean).map((v) => titleCase(v!)).join(", "), `State: ${address.state} Code: ${address.stateCode}`] : []),
      ...(p.tdsPan ? [`PAN : ${p.tdsPan}`] : []),
      rcm.supplierGstin ? `GSTIN : ${rcm.supplierGstin}` : "Unregistered, no GSTIN",
      ...(p.partyPhone ? [`Phone: +91 ${p.partyPhone}`] : []),
    ],
    firstEnd,
    WIDTH,
  );
  line(LEFT, paidToEnd, RIGHT, paidToEnd);

  // the particulars: the service, its code, taxable value, GST % and each tax, and the total; the last column is as wide
  // as the breakup's figures, which sit under it
  const amountAt = RIGHT - AMOUNT;
  const taxes: [string, number][] = rcm.otherState ? [["IGST", rcm.gst]] : [["CGST", half(rcm.gst)], ["SGST", Math.round((rcm.gst - half(rcm.gst)) * 100) / 100]];
  const taxWidth = 54;
  const rateAt = amountAt - taxWidth * taxes.length - 46;
  const taxableAt = rateAt - 74;
  const sacAt = taxableAt - 50;
  const sl = LEFT + 28;
  const at = [LEFT, sl, sacAt, taxableAt, rateAt, ...taxes.map((_, i) => rateAt + 46 + i * taxWidth), amountAt, RIGHT];
  const heads = ["Sl", "Particulars", "SAC", "Taxable value", "GST %", ...taxes.map(([tax]) => tax), "Total"];
  const gross = Math.round((rcm.taxable + rcm.gst) * 100) / 100;
  const words = titleCase(p.paidToName);
  const cells = [`1`, words, rcm.sac, money(rcm.taxable), `${rcm.rate}%`, ...taxes.map(([, v]) => money(v)), money(gross)];
  const right = (i: number) => i >= 3;
  heads.forEach((h, i) => write(h, at[i]! + PAD, paidToEnd + 6, at[i + 1]! - at[i]! - PAD * 2, { bold: true, align: right(i) ? "right" : "left" }));
  const headEnd = paidToEnd + ROW;
  line(LEFT, headEnd, RIGHT, headEnd);
  cells.forEach((v, i) => write(v, at[i]! + PAD, headEnd + 6, at[i + 1]! - at[i]! - PAD * 2, { align: right(i) ? "right" : "left" }));
  // room below the lines, as on the voucher
  const tableEnd = headEnd + 12 + tall(words, sacAt - sl - PAD * 2) + 30;
  for (const x of at.slice(1, -1)) line(x, paidToEnd, x, tableEnd);
  line(LEFT, tableEnd, RIGHT, tableEnd);

  // where it was paid from (a row per place, Total when more than one) on the left; the breakup on the right: Total,
  // the reverse-charge GST paid by us and the TDS taken off it, and the amount paid in chestnut
  const labelAt = amountAt - 132;
  const sources: [string, string, string, number][] = [
    ...(p.settledIn !== "bank" ? [["Cash", "-", "-", p.settledIn === "cash" ? p.amount : p.cashAmount] as [string, string, string, number]] : []),
    ...(p.bank ? [[titleCase(p.bank.name), mode(p.bankMode), `**** ${p.bank.last4}`, Math.round((p.bankAmount - p.moreBankParts.reduce((a, m) => a + m.amount, 0)) * 100) / 100] as [string, string, string, number]] : []),
    ...p.moreBankParts.map((m) => [titleCase(m.name), mode(m.mode), `**** ${m.last4}`, m.amount] as [string, string, string, number]),
  ];
  const fromRows = sources.length > 0 ? sources : [["Bank", "-", "-", p.amount] as [string, string, string, number]];
  const fromWidth = labelAt - LEFT;
  pdf.rect(LEFT, tableEnd, fromWidth, ROW + 2).fill(CHESTNUT);
  write("Paid from", LEFT + PAD, tableEnd + 6, fromWidth - PAD * 2, { bold: true, size: 10, color: "#ffffff" });
  const fromAt = [LEFT, LEFT + 78, LEFT + 142, LEFT + 204, labelAt];
  const fromTop = tableEnd + ROW + 2;
  // a row as tall as its longest cell needs; gives back where it ended
  const fromRow = (top: number, row: string[], bold = false) => {
    const widths = row.map((_, i) => fromAt[i + 1]! - fromAt[i]! - PAD * 2);
    row.forEach((v, i) => write(v, fromAt[i]! + PAD, top + 6, widths[i]!, { bold, align: i === 3 ? "right" : "left" }));
    return top + Math.max(ROW, ...row.map((v, i) => tall(v, widths[i]!, bold) + 12));
  };
  const fromBody = [...fromRows.map(([a, b, c, d]) => [a, b, c, money(d)]), ...(fromRows.length > 1 ? [["Total", "", "", money(p.amount)]] : [])];
  let fromEnd = fromRow(fromTop, ["Source", "Mode", "A/c Number", "Amount (Rs)"], true);
  fromBody.forEach((row, i) => {
    line(LEFT, fromEnd, labelAt, fromEnd);
    fromEnd = fromRow(fromEnd, row, fromRows.length > 1 && i === fromBody.length - 1);
  });
  for (const x of fromAt.slice(1, 4)) line(x, fromTop, x, fromEnd);

  const breakup: [string, string][] = [
    ["Total", `Rs. ${money(gross)}`],
    [`Less RCM GST ${rcm.rate}% (paid by us)`, `- Rs. ${money(rcm.gst)}`],
    ...(tds > 0 ? ([[`Less TDS ${p.tdsRate ?? 0}%`, `- Rs. ${money(tds)}`]] as [string, string][]) : []),
  ];
  // each row as tall as its words need
  let y = tableEnd;
  breakup.forEach(([label, value]) => {
    const height = Math.max(ROW, tall(label, 132 - PAD * 2) + 12);
    write(label, labelAt + PAD, y + 6, 132 - PAD * 2, { align: "right" });
    write(value, amountAt + PAD, y + 6, AMOUNT - PAD * 2, { bold: true, align: "right" });
    y += height;
    line(labelAt, y, RIGHT, y);
  });
  const paidTop = y;
  pdf.rect(labelAt, paidTop, RIGHT - labelAt, ROW + 4).fill(CHESTNUT);
  write("Amount paid", labelAt + PAD, paidTop + 6, 132 - PAD * 2, { bold: true, size: 10, color: "#ffffff", align: "right" });
  write(`Rs. ${money(p.amount)}`, amountAt + PAD, paidTop + 6, AMOUNT - PAD * 2, { bold: true, size: 10, color: "#ffffff", align: "right" });
  const breakupEnd = paidTop + ROW + 4;
  line(amountAt, tableEnd, amountAt, paidTop);
  const bottomEnd = Math.max(fromEnd, breakupEnd);
  line(labelAt, tableEnd, labelAt, bottomEnd);
  line(LEFT, bottomEnd, RIGHT, bottomEnd);

  // the amount paid in words
  const label = LEFT + 126;
  write("Total in words (Rupees)", LEFT + PAD, bottomEnd + 6, 118, { bold: true });
  write(amountInWords(p.amount), label + PAD, bottomEnd + 6, RIGHT - label - PAD * 2);
  line(label, bottomEnd, label, bottomEnd + ROW);
  const boxEnd = bottomEnd + ROW;
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

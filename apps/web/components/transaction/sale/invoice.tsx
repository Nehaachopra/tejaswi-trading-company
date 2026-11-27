"use client";

import { ArrowLeft, CircleAlert, Download, Flag, Mail, Pencil, Phone } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import type { RouterOutputs } from "@repo/trpc/client";
import { Spinner } from "~/components/ui/icons/spinner";
import { WhatsAppIcon } from "~/components/ui/icons/whatsapp-icon";
import { amountInWords } from "~/lib/amount-words";
import { packLabel, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { HistoryTransaction } from "~/providers/history";
import { useSaleInvoice, useSaleShareKey } from "~/providers/sale";

import { DocStamp } from "../../history/doc-stamp";
import { BlockedButton } from "../../history/blocked-button";
import { CancelledNote } from "../../history/cancelled-note";
import { EditedNote } from "../../history/edited-note";
import { EditLog } from "../../history/edit-log";
import { ReturnsLog } from "../../history/returns-log";
import { ReturnButton } from "../sale-return/return-button";

import { Breakup, DocHead, LAST_COL, LeftQuantity, Remarks } from "../done/document-parts";
import { band, cell, dated, Detail, money } from "../done/voucher";

type Invoice = RouterOutputs["transactions"]["sale"]["invoice"];
type Place = Invoice["shipTo"];

// a button's look on the chestnut page, as on the voucher
const pill =
  "on-ivory flex min-h-11 items-center justify-center gap-2 rounded-control bg-ivory px-3 text-sm font-semibold text-chestnut disabled:opacity-50 sm:px-4";

// an address on one line: its line, landmark, then town - PIN
const placeLine = (a: Place) =>
  [a.line1, a.line2, [a.city, a.postalCode].filter(Boolean).join(" - ")]
    .filter(Boolean)
    .map((part) => titleCase(part!))
    .join(", ");

// a sale's tax invoice, laid out like the payment voucher and the order: our details and the invoice's, who it's billed
// to and where it goes, each item (its category over its name, HSN, quantity, a pack's price, the discount off the
// line, its taxable value, GST % and the GST by tax, and its total); with charges, a Sub total row and then each charge
// as a row of its own at the bill's highest GST rate; a Total row, then the cash discount off (after GST), the amount
// and the amount in words. It prints (or saves as a PDF) on its own. With a share key it's the customer's copy, opened
// from a link without a login: only the download, no way back into the app and nothing to share. Opened from History
// it goes back there, with the admin's Return and Edit sale (no Cancel sale for now); one cancelled before has a note
// above it (when, by whom, why). A cancelled sale carries a CANCELLED stamp everywhere, printed too, and isn't shared
export function SaleInvoice({
  id,
  shareKey,
  history,
}: {
  id: string;
  shareKey?: string;
  history?: { record: HistoryTransaction; isAdmin: boolean };
}) {
  const t = useTranslations("transactions.sale.invoice");
  const ts = useTranslations("transactions.sale");
  const th = useTranslations("history");
  const shared = shareKey !== undefined;
  const doc = useSaleInvoice(id, shareKey);
  const link = useSaleShareKey(id, !shared);
  if (doc.loading)
    return (
      <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
        <Spinner /> {t("loading")}
      </p>
    );
  if (doc.loadFailed)
    return (
      <p role="alert" className="mt-16 flex items-center justify-center gap-2">
        <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
      </p>
    );

  const d = doc.invoice!;
  const c = d.company;
  const cancelled = d.status === "cancelled";
  // the admin's Return and Edit sale, from History, while it's live (Edit greyed when it can't be)
  const record = history?.record;
  // how many of each product went back on its returns (History only): its row shows what's left
  const returnedOf = new Map((record?.returnedLines ?? []).map((r) => [r.productId, r.quantity]));
  const canAsk = !!history?.isAdmin && !cancelled;
  const blocked = record?.cancelBlockedBy && record.cancelBlockedBy !== "cancelled" ? record.cancelBlockedBy : null;
  // who it's billed to: their full name, never the short name (as the vouchers)
  const buyer = d.buyer.name.trim() ? titleCase(d.buyer.name) : t("walkIn");
  // the payment terms at the sale: paid in full, credit (due by its day), or part received with the rest due (credit)
  // or on their account (a customer's cash sale)
  const left = Math.round((d.total - d.paidAtSale) * 100) / 100;
  const dueBy = d.dueOn ? dated(`${d.dueOn}T12:00:00+05:30`) : null;
  const terms =
    left <= 0
      ? ts("kinds.cash")
      : d.paidAtSale <= 0
        ? dueBy
          ? t("creditDue", { date: dueBy })
          : ts("kinds.credit")
        : d.kind === "cash"
          ? t("partOnAccount", { paid: money(d.paidAtSale), left: money(left) })
          : dueBy
            ? t("partPaid", { paid: money(d.paidAtSale), left: money(left), date: dueBy })
            : t("partPaidOpen", { paid: money(d.paidAtSale), left: money(left) });
  const intra = d.supplyType === "intra";
  // half of a line's GST to each of CGST and SGST (the odd paisa to SGST)
  const halves = (gst: number) => {
    const c = Math.floor((gst * 100) / 2 + 1e-6) / 100;
    return [c, Math.round((gst - c) * 100) / 100] as const;
  };
  const sum = (pick: (l: Invoice["lines"][number]) => number) =>
    Math.round(d.lines.reduce((a, l) => a + pick(l), 0) * 100) / 100;
  const quantity = d.lines.reduce((a, l) => a + l.quantity, 0);
  const itemsGst = sum((l) => l.gst);
  // the items with their GST: the Sub total, when charges follow
  const itemsTotal = Math.round((sum((l) => l.taxable) + itemsGst) * 100) / 100;
  // the charges (part of the supply): each a row under the items, its GST at the highest rate among them
  const chargeRate = Math.max(0, ...d.lines.map((l) => l.gstRate));
  const charges = d.charges.map((c) => ({ ...c, label: ts(c.key === "loading" ? "loadingCharges" : c.key), total: Math.round((c.taxable + c.gst) * 100) / 100 }));
  const add = (a: number, b: number) => Math.round((a + b) * 100) / 100;
  const chargeSum = (pick: (c: (typeof charges)[number]) => number) => charges.reduce((a, c) => add(a, pick(c)), 0);
  // the table's Total: the items and the charges, with their GST
  const tableTotal = add(itemsTotal, chargeSum((c) => c.total));
  // under the table: the cash discount off (after GST, which stays on the full value), then the round off (the amount
  // rounded to the rupee); the amount closes it. Total first, when either changes it
  const breakup =
    d.discount > 0 || d.roundOff !== 0
      ? [
          { key: "total", label: t("total"), value: `₹${money(tableTotal)}` },
          ...(d.discount > 0 ? [{ key: "discount", label: ts("discount"), value: `− ₹${money(d.discount)}` }] : []),
          ...(d.roundOff !== 0
            ? [{ key: "roundOff", label: ts("roundOff"), value: `${d.roundOff > 0 ? "+" : "−"} ₹${money(Math.abs(d.roundOff))}` }]
            : []),
        ]
      : [];

  // WhatsApp opened on the customer's chat with a message ready to send: the invoice number, the amount and the link
  // that opens the invoice without a login
  const whatsApp = (key: string) => {
    const url = `${window.location.origin}/voucher/sale/${d.transactionId}?k=${encodeURIComponent(key)}`;
    const text = t("whatsAppMessage", {
      number: d.assignedId,
      amount: money(d.total),
      company: c.name,
      url,
    });
    const to = d.buyer.phone ? `91${d.buyer.phone.replace(/\D/g, "").slice(-10)}` : "";
    return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
  };

  return (
    <main className="mx-auto max-w-4xl px-4 pb-28 pt-6 sm:px-6">
      <h1 className="sr-only">{t("title")}</h1>

      {/* back to the sale's page (or History), sending it on WhatsApp, the download and (the admin, from History) Cancel
          sale; on a phone each button is full width, under the back link */}
      <div className="no-print mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        {shared ? (
          <span className="hidden sm:block" />
        ) : (
          <Link
            // (a return's replacement, from History: back to that return, where its Replacements are)
            href={history ? (record?.replacementFor ? `/history/${record.replacementFor.transactionId}` : "/history") : `/transaction/sale/${id}`}
            className="flex min-h-11 items-center gap-1.5 text-sm font-medium"
          >
            <ArrowLeft className="size-4" aria-hidden /> {history ? (record?.replacementFor?.assignedId ?? th("title")) : t("back")}
          </Link>
        )}
        {/* (from History, on a phone the buttons sit two to a row) */}
        <div
          className={cn(
            history ? "grid grid-cols-2" : "flex flex-col",
            "gap-2 sm:flex sm:flex-row sm:items-center",
          )}
        >
          {/* WhatsApp only when the buyer's phone is kept, and never once cancelled */}
          {!shared && !cancelled && d.buyer.phone && (
            <button
              type="button"
              disabled={!link.key}
              onClick={() => window.open(whatsApp(link.key!), "_blank", "noopener")}
              aria-label={t("whatsApp")}
              className={pill}
            >
              <span className="whitespace-nowrap">{t("shareOn")}</span>
              <WhatsAppIcon className="size-4 shrink-0" />
            </button>
          )}
          {/* the download: the page printed as a PDF */}
          <button type="button" onClick={() => window.print()} className={pill}>
            <Download className="size-4" aria-hidden /> {t("download")}
          </button>
          {/* Return: while something of it can still come back */}
          {/* Edit sale: greyed once its GSTR-1 month is filed, it's a return's replacement, or every item came back; a
              tap or hover says why */}
          {canAsk &&
            (blocked === "gstFiled" || record?.replacementFor || record?.allReturned ? (
              <BlockedButton
                className={pill}
                reason={th(blocked === "gstFiled" ? "editBlocked.gstFiledSale" : record?.replacementFor ? "editBlocked.replacement" : "editBlocked.returnedSale")}
              >
                <Pencil className="size-4" aria-hidden /> {th("editSale")}
              </BlockedButton>
            ) : (
              <Link href={`/history/${id}/edit`} className={pill}>
                <Pencil className="size-4" aria-hidden /> {th("editSale")}
              </Link>
            ))}
        </div>
      </div>
      {/* a cancelled one: when, by whom and why */}
      {record && cancelled && <CancelledNote at={record.cancelledAt} by={record.cancelledByName} reason={record.cancelReason} />}
      {/* an edited one: when it was last edited, and by whom */}
      {record?.lastEditedAt && record.lastEditedByName && <EditedNote at={record.lastEditedAt} by={record.lastEditedByName} />}

      {/* the invoice itself */}
      <article className="print-area on-ivory relative overflow-hidden rounded-control bg-ivory p-3 text-sm text-chestnut sm:p-5">
        <DocHead title={t("title")} screenTitle={ts("title")} jurisdiction={t("jurisdiction", { place: c.jurisdiction })} />
        {/* a cancelled sale: a faded CANCELLED stamp across it (printed too), over everything but not in the way */}
        {cancelled ? (
          <DocStamp label={th("stamp")} tone="danger" />
        ) : (
          // every pack gone back: RETURNED
          record?.returnedShare === 100 && <DocStamp label={th("stampReturned")} tone="chestnut" />
        )}
        {cancelled && <p className="sr-only">{t("cancelled")}</p>}

        <div className="flex flex-col border border-chestnut/40 print:block">
          {/* our details (printed only), and the invoice's */}
          <div className="grid print:grid-cols-[1fr_1.5fr]">
            <div className="hidden min-w-0 flex-col border-b border-chestnut/40 print:flex print:border-r">
              <p className={band}>{c.name}</p>
              <div className={cn(cell, "flex flex-col gap-0.5 break-words")}>
                <span>{c.address}</span>
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3.5 shrink-0" aria-hidden /> {c.phone}
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <Mail className="size-3.5 shrink-0" aria-hidden />{" "}
                  <span className="min-w-0 break-all">{c.email}</span>
                </span>
                <span>
                  {t("state")}: {c.state} {t("code")}: {c.stateCode}
                </span>
                <span>GSTIN : {c.gstin}</span>
                <span>FSSAI No : {c.fssai}</span>
              </div>
            </div>
            {/* the details, then our terms and the remarks under their last row */}
            <div className="flex min-w-0 flex-col border-b border-chestnut/40">
            <div className="grid grid-cols-[auto_1fr] content-start [&>*:nth-child(2n)]:border-r-0 sm:grid-cols-[auto_1fr_auto_1fr] sm:[&>*:nth-child(2n)]:border-r sm:[&>*:nth-child(4n)]:border-r-0">
              <Detail
                label={t("number")}
                value={<span className="font-bold">{d.assignedId}</span>}
              />
              <Detail label={t("dated")} value={dated(`${d.invoiceDate}T12:00:00+05:30`)} />
              <Detail label={t("payment")} value={terms} />
              <Detail
                label={t("placeOfSupply")}
                value={d.shipTo.state ? `${d.shipTo.state} (${d.shipTo.stateCode ?? ""})` : null}
              />
              {/* the vehicle, last and alone on its row: its value runs to the end, so the line under it (over the
                  terms) is whole */}
              <span className={cn(cell, "border-b border-r font-medium")}>{t("vehicle")}</span>
              <span className={cn(cell, "tabular border-b sm:col-span-3 sm:border-r-0!")}>{d.vehicleNumber ?? "—"}</span>
            </div>
            <div className={cn(cell, "hidden border-b break-words print:block")}>
              <span className="font-semibold">{t("terms")}:</span>
              <ol className="mt-0.5 list-decimal pl-4 text-xs">
                <li>{t("term1")}</li>
                <li>{t("term2")}</li>
              </ol>
            </div>
            <Remarks label={t("remarks")} text={d.remarks} />
            </div>
          </div>

          {/* who it's billed to, and where it goes: on the screen, on top */}
          <div className={cn("order-first grid border-b border-chestnut/40 print:order-none print:grid-cols-2", d.billTo && "sm:grid-cols-2")}>
            <div className={cn("flex min-w-0 flex-col border-b border-chestnut/40 sm:border-b-0 print:border-r", d.billTo && "sm:border-r")}>
              <p className={cn(band, "break-words")}>
                {t("billTo")}: {buyer}
              </p>
              <div className={cn(cell, "flex flex-col gap-0.5 break-words")}>
                {(d.billTo ?? d.shipTo).city && (
                  <>
                    <span className="flex items-start gap-1.5">
                      <Flag className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {placeLine(d.billTo ?? d.shipTo)}
                    </span>
                    <span>
                      {t("state")}: {(d.billTo ?? d.shipTo).state} {t("code")}:{" "}
                      {(d.billTo ?? d.shipTo).stateCode}
                    </span>
                  </>
                )}
                {d.buyer.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="size-3.5 shrink-0" aria-hidden /> {d.buyer.phone}
                  </span>
                )}
                {d.buyer.gstin && <span>GSTIN : {d.buyer.gstin}</span>}
              </div>
            </div>
            {/* on the screen only when it goes somewhere other than where it's billed */}
            <div className={cn("min-w-0 flex-col", d.billTo ? "flex" : "hidden print:flex")}>
              <p className={band}>{t("shipTo")}</p>
              <div className={cn(cell, "flex flex-col gap-0.5 break-words")}>
                <span className="flex items-start gap-1.5">
                  <Flag className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {placeLine(d.shipTo)}
                </span>
                <span>
                  {t("state")}: {d.shipTo.state} {t("code")}: {d.shipTo.stateCode}
                </span>
              </div>
            </div>
          </div>

          {/* the items: quantity, a pack's price, the discount off the line, its taxable value, GST % and the GST by tax
              (CGST and SGST within our state, IGST outside it), and its total. Sideways on a phone. On the screen at
              most five rows tall, then it scrolls with the column names held on top and the Total row at the
              bottom; printed (the PDF), every row shows */}
          <div className="max-h-[294px] overflow-auto print:max-h-none print:overflow-visible">
            <table className="tabular w-full min-w-[40rem] border-collapse text-[0.8125rem] [&_td]:px-1.5 [&_th]:px-1.5">
              <thead>
                {/* held on top while the rows scroll (its bottom line drawn as a shadow, which stays with it) */}
                <tr className="text-left [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-ivory [&>th]:shadow-[inset_0_-1px_0_rgb(90_42_26/0.4)] print:[&>th]:static">
                  <th className={cn(cell, "w-10 border-r font-semibold")}>{t("sl")}</th>
                  <th className={cn(cell, "border-r font-semibold")}>{t("particulars")}</th>
                  <th className={cn(cell, "border-r font-semibold")}>HSN</th>
                  <th className={cn(cell, "border-r text-right font-semibold")}>{t("qty")}</th>
                  <th className={cn(cell, "border-r text-right font-semibold")}>{t("price")}</th>
                  <th className={cn(cell, "border-r text-right font-semibold")}>{t("discount")}</th>
                  <th className={cn(cell, "border-r text-right font-semibold")}>{t("taxable")}</th>
                  <th className={cn(cell, "border-r text-right font-semibold")}>
                    {t("gstPercent")}
                  </th>
                  {intra ? (
                    <>
                      <th className={cn(cell, "border-r text-right font-semibold")}>CGST</th>
                      <th className={cn(cell, "border-r text-right font-semibold")}>SGST</th>
                    </>
                  ) : (
                    <th className={cn(cell, "border-r text-right font-semibold")}>IGST</th>
                  )}
                  <th className={cn(cell, LAST_COL, "text-right font-semibold")}>{t("total")}</th>
                </tr>
              </thead>
              <tbody>
                {d.lines.map((l, i) => (
                  <tr key={l.productId} className={cn("align-top", (returnedOf.get(l.productId) ?? 0) >= l.quantity && "row-returned")}>
                    <td className={cn(cell, "border-r")}>{i + 1}</td>
                    {/* the category on top, then the brand and pack size */}
                    <td className={cn(cell, "border-r")}>
                      <span className="block text-xs opacity-70">{titleCase(l.category)}</span>
                      {titleCase(l.title)} {packLabel(l.packSize, l.packSizeCode, l.packCount)}
                    </td>
                    <td className={cn(cell, "border-r")}>{l.hsn ?? ""}</td>
                    <td className={cn(cell, "border-r text-right")}>
                      <LeftQuantity billed={l.quantity} returned={returnedOf.get(l.productId) ?? 0} />
                    </td>
                    <td className={cn(cell, "border-r text-right")}>{money(l.rate)}</td>
                    <td className={cn(cell, "border-r text-right")}>{money(l.discount)}</td>
                    <td className={cn(cell, "border-r text-right")}>{money(l.taxable)}</td>
                    <td className={cn(cell, "border-r text-right")}>{l.gstRate}%</td>
                    {intra ? (
                      <>
                        <td className={cn(cell, "border-r text-right")}>
                          {money(halves(l.gst)[0])}
                        </td>
                        <td className={cn(cell, "border-r text-right")}>
                          {money(halves(l.gst)[1])}
                        </td>
                      </>
                    ) : (
                      <td className={cn(cell, "border-r text-right")}>{money(l.gst)}</td>
                    )}
                    <td className={cn(cell, "text-right")}>
                      {money(Math.round((l.taxable + l.gst) * 100) / 100)}
                    </td>
                  </tr>
                ))}
                {/* with charges: the items' Sub total, then each charge as a row (its taxable value, GST % and GST
                    by tax, and its total; nothing under Qty, Price or Discount) */}
                {charges.length > 0 && (
                  <>
                    <tr className="border-t border-chestnut/40 font-semibold">
                      <td className={cn(cell, "border-r")} />
                      <td className={cn(cell, "border-r")}>{t("subTotal")}</td>
                      <td className={cn(cell, "border-r")} />
                      <td className={cn(cell, "border-r text-right")}>{quantity}</td>
                      <td className={cn(cell, "border-r")} />
                      <td className={cn(cell, "border-r text-right")}>{money(sum((l) => l.discount))}</td>
                      <td className={cn(cell, "border-r text-right")}>{money(sum((l) => l.taxable))}</td>
                      <td className={cn(cell, "border-r")} />
                      {intra ? (
                        <>
                          <td className={cn(cell, "border-r text-right")}>{money(sum((l) => halves(l.gst)[0]))}</td>
                          <td className={cn(cell, "border-r text-right")}>{money(sum((l) => halves(l.gst)[1]))}</td>
                        </>
                      ) : (
                        <td className={cn(cell, "border-r text-right")}>{money(itemsGst)}</td>
                      )}
                      <td className={cn(cell, "text-right")}>{money(itemsTotal)}</td>
                    </tr>
                    {charges.map((c, i) => (
                      <tr key={c.key} className={cn("align-top", i === 0 && "border-t border-chestnut/40")}>
                        <td className={cn(cell, "border-r")} />
                        <td className={cn(cell, "border-r")}>{c.label}</td>
                        <td className={cn(cell, "border-r")} />
                        <td className={cn(cell, "border-r")} />
                        <td className={cn(cell, "border-r")} />
                        <td className={cn(cell, "border-r")} />
                        <td className={cn(cell, "border-r text-right")}>{money(c.taxable)}</td>
                        <td className={cn(cell, "border-r text-right")}>{chargeRate}%</td>
                        {intra ? (
                          <>
                            <td className={cn(cell, "border-r text-right")}>{money(halves(c.gst)[0])}</td>
                            <td className={cn(cell, "border-r text-right")}>{money(halves(c.gst)[1])}</td>
                          </>
                        ) : (
                          <td className={cn(cell, "border-r text-right")}>{money(c.gst)}</td>
                        )}
                        <td className={cn(cell, "text-right")}>{money(c.total)}</td>
                      </tr>
                    ))}
                  </>
                )}
                {/* room below the lines, as on the voucher */}
                <tr aria-hidden>
                  {Array.from({ length: intra ? 10 : 9 }, (_, i) => (
                    <td key={i} className="h-14 border-r border-chestnut/40" />
                  ))}
                  <td />
                </tr>
                {/* the totals: how many, the discount, the taxable value, each tax and the total, the charges in them */}
                <tr className="font-bold [&>td]:sticky [&>td]:bottom-0 [&>td]:z-10 [&>td]:bg-ivory [&>td]:shadow-[inset_0_1px_0_rgb(90_42_26/0.4)] print:[&>td]:static">
                  <td className={cn(cell, "border-r")} />
                  <td className={cn(cell, "border-r")}>{t("total")}</td>
                  <td className={cn(cell, "border-r")} />
                  <td className={cn(cell, "border-r text-right")}>{quantity}</td>
                  <td className={cn(cell, "border-r")} />
                  <td className={cn(cell, "border-r text-right")}>
                    {money(sum((l) => l.discount))}
                  </td>
                  <td className={cn(cell, "border-r text-right")}>
                    {money(add(sum((l) => l.taxable), chargeSum((c) => c.taxable)))}
                  </td>
                  <td className={cn(cell, "border-r")} />
                  {intra ? (
                    <>
                      <td className={cn(cell, "border-r text-right")}>
                        {money(add(sum((l) => halves(l.gst)[0]), chargeSum((c) => halves(c.gst)[0])))}
                      </td>
                      <td className={cn(cell, "border-r text-right")}>
                        {money(add(sum((l) => halves(l.gst)[1]), chargeSum((c) => halves(c.gst)[1])))}
                      </td>
                    </>
                  ) : (
                    <td className={cn(cell, "border-r text-right")}>{money(add(itemsGst, chargeSum((c) => c.gst)))}</td>
                  )}
                  <td className={cn(cell, "text-right")}>{money(tableTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* the breakup at the right, its figures under the table's Total */}
          <div className="grid border-t border-chestnut/40 sm:grid-cols-[1fr_auto]">
            <span aria-hidden className="hidden sm:block" />
            <Breakup rows={breakup} label={t("amount")} amount={`₹${money(d.total)}`} />
          </div>

          {/* the amount in words */}
          <div className="hidden border-t border-chestnut/40 print:grid print:grid-cols-[12rem_1fr]">
            <span className={cn(cell, "font-semibold sm:border-r")}>{t("inWords")}</span>
            <span className={cell}>{amountInWords(d.total)}</span>
          </div>
        </div>

        {/* computer generated, and the signatures */}
        <p className="hidden pt-2 font-semibold print:block">{t("computerGenerated")}</p>
        <div className="mt-12 hidden items-end justify-between gap-6 print:flex">
          <p>{t("receiver")}</p>
          <p className="font-semibold">{t("signatory")}</p>
        </div>
      </article>

      {/* in History: the sale's returns, under the invoice */}
      {record && (
        <ReturnsLog
          returns={record.returns}
          returnOnly
          share={record.returnedShare}
          // Return: while something of it can still come back (the admin's)
          action={canAsk && <ReturnButton id={id} saleDay={d.invoiceDate} className={pill} />}
        />
      )}

      {/* and its edits: the date and the total as they changed */}
      {record && <EditLog edits={record.edits} />}
    </main>
  );
}

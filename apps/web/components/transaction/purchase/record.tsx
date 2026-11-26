"use client";

import { ArrowLeft, CircleAlert, Download, Flag, Phone, Receipt } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import type { RouterOutputs } from "@repo/trpc/client";
import { Spinner } from "~/components/ui/icons/spinner";
import { amountInWords } from "~/lib/amount-words";
import { titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { HistoryTransaction } from "~/providers/history";
import { useSavedPurchase } from "~/providers/purchase";

import { CancelledNote } from "../../history/cancelled-note";
import { EditedNote } from "../../history/edited-note";
import { EditLog } from "../../history/edit-log";
import { ReturnsLog } from "../../history/returns-log";
import { Breakup, DocHead, LAST_COL, Remarks } from "../done/document-parts";
import { band, cell, dated, Detail, money } from "../done/voucher";
import { PurchaseReturnButton } from "../purchase-return/return-button";

type Purchase = RouterOutputs["transactions"]["purchase"]["get"];

// a button's look on the chestnut page, as on the invoice
const pill =
  "on-ivory flex min-h-11 items-center justify-center gap-2 rounded-control bg-ivory px-3 text-sm font-semibold text-chestnut disabled:opacity-50 sm:px-4";

// the supplier's address on one line: its line, landmark, then town - PIN
const placeLine = (a: Purchase["billFrom"]) =>
  [a.line1, a.line2, [a.city, a.postalCode].filter(Boolean).join(" - ")]
    .filter(Boolean)
    .map((part) => titleCase(part!))
    .join(", ");

// /history/[id] for a purchase, laid out as a sale's tax invoice: who the bill is from (the supplier) beside the
// purchase's details (our number and day, the supplier's bill number, the payment, the vehicle) with the remarks under
// them; each item (quantity, a pack's rate, the discount off the line, its taxable value, GST % and the GST by tax, and
// its total); with charges, a Sub total row and each charge as a row at the bill's highest GST rate; the Total row, the
// cash discount and round off, the amount and the amount in words. Back goes to History; the download prints it, the
// supplier's bill opens when attached, and (the admin's) Return while something can still go back. Under it the
// purchase's returns and edits. A cancelled one has its note and a CANCELLED stamp
export function PurchaseRecord({ id, history }: { id: string; history: { record: HistoryTransaction; isAdmin: boolean } }) {
  const t = useTranslations("transactions.purchase.record");
  const tp = useTranslations("transactions.purchase");
  const ts = useTranslations("transactions.sale");
  const ti = useTranslations("transactions.sale.invoice");
  const th = useTranslations("history");
  const read = useSavedPurchase(id);
  if (read.loading)
    return (
      <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
        <Spinner /> {ti("loading")}
      </p>
    );
  if (read.loadFailed || !read.purchase)
    return (
      <p role="alert" className="mt-16 flex items-center justify-center gap-2">
        <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
      </p>
    );

  const d = read.purchase;
  const record = history.record;
  const cancelled = d.status === "cancelled";
  const canAsk = history.isAdmin && !cancelled;
  // the payment at the purchase: paid in full, on credit, or part paid with the rest due
  const left = Math.round((d.total - d.paid) * 100) / 100;
  const terms = left <= 0 ? ts("kinds.cash") : d.paid <= 0 ? ts("kinds.credit") : t("paidPart", { paid: money(d.paid), left: money(left) });
  const intra = d.supplyType === "intra";
  // half of a line's GST to each of CGST and SGST (the odd paisa to SGST)
  const halves = (gst: number) => {
    const h = Math.floor((gst * 100) / 2 + 1e-6) / 100;
    return [h, Math.round((gst - h) * 100) / 100] as const;
  };
  const add = (a: number, b: number) => Math.round((a + b) * 100) / 100;
  const sum = (pick: (l: Purchase["lines"][number]) => number) => Math.round(d.lines.reduce((a, l) => a + pick(l), 0) * 100) / 100;
  const quantity = d.lines.reduce((a, l) => a + l.quantity, 0);
  const itemsGst = sum((l) => l.gst);
  const itemsTotal = add(sum((l) => l.taxable), itemsGst);
  // the charges (typed with GST in them): each a row under the items, its GST taken out at the highest rate among them
  const chargeRate = Math.max(0, ...d.lines.map((l) => l.gstRate));
  const chargeLabel = { freight: tp("freight"), packing: ts("packing"), loading: ts("loadingCharges"), other: tp("otherCharges") } as const;
  const charges = d.charges.map((c) => {
    const taxable = Math.round((c.amount * 100) / (100 + chargeRate)) / 100;
    return { key: c.key, label: chargeLabel[c.key], taxable, gst: Math.round((c.amount - taxable) * 100) / 100, total: c.amount };
  });
  const chargeSum = (pick: (c: (typeof charges)[number]) => number) => charges.reduce((a, c) => add(a, pick(c)), 0);
  const tableTotal = add(itemsTotal, chargeSum((c) => c.total));
  // under the table: the cash discount, then the round off; Total first when either changes it
  const breakup =
    d.discount > 0 || d.roundOff !== 0
      ? [
          { key: "total", label: ti("total"), value: `₹${money(tableTotal)}` },
          ...(d.discount > 0 ? [{ key: "discount", label: ts("discount"), value: `− ₹${money(d.discount)}` }] : []),
          ...(d.roundOff !== 0 ? [{ key: "roundOff", label: tp("roundOff"), value: `${d.roundOff > 0 ? "+" : "−"} ₹${money(Math.abs(d.roundOff))}` }] : []),
        ]
      : [];

  return (
    <main className="mx-auto max-w-4xl px-4 pb-28 pt-6 sm:px-6">
      <h1 className="sr-only">{t("title")}</h1>

      {/* back to History, the supplier's bill, the download and (the admin's) Return; on a phone two to a row */}
      <div className="no-print mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <Link href="/history" className="flex min-h-11 items-center gap-1.5 text-sm font-medium">
          <ArrowLeft className="size-4" aria-hidden /> {th("title")}
        </Link>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:items-center">
          {d.invoiceUrl && (
            <a href={d.invoiceUrl} target="_blank" rel="noopener noreferrer" className={pill}>
              <Receipt className="size-4" aria-hidden /> {t("bill")}
            </a>
          )}
          <button type="button" onClick={() => window.print()} className={pill}>
            <Download className="size-4" aria-hidden /> {ti("download")}
          </button>
          {/* Return: while something of it can still go back */}
          {canAsk && <PurchaseReturnButton id={id} purchaseDay={d.invoiceDate} className={pill} />}
        </div>
      </div>
      {/* a cancelled one: when, by whom and why */}
      {cancelled && <CancelledNote at={record.cancelledAt} by={record.cancelledByName} reason={record.cancelReason} />}
      {record.lastEditedAt && record.lastEditedByName && <EditedNote at={record.lastEditedAt} by={record.lastEditedByName} />}

      <article className="print-area on-ivory relative overflow-hidden rounded-control bg-ivory p-3 text-sm text-chestnut sm:p-5">
        <DocHead title={t("title")} jurisdiction="" />
        {cancelled && (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
            <span className="-rotate-[24deg] rounded-control border-4 border-danger px-5 pb-1 pt-3 font-heading text-6xl font-bold tracking-[0.06em] text-danger opacity-35 sm:text-8xl">
              {th("stamp")}
            </span>
          </div>
        )}

        <div className="border border-chestnut/40">
          {/* who the bill is from, and the purchase's details */}
          <div className="grid sm:grid-cols-[1fr_1.5fr]">
            <div className="flex min-w-0 flex-col border-b border-chestnut/40 sm:border-r">
              <p className={cn(band, "break-words")}>
                {t("from")}: {titleCase(d.supplier.name)}
              </p>
              <div className={cn(cell, "flex flex-col gap-0.5 break-words")}>
                <span className="flex items-start gap-1.5">
                  <Flag className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {placeLine(d.billFrom)}
                </span>
                <span>
                  {ti("state")}: {d.billFrom.state} {ti("code")}: {d.billFrom.stateCode}
                </span>
                {d.supplier.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="size-3.5 shrink-0" aria-hidden /> {d.supplier.phone}
                  </span>
                )}
                {d.supplier.gstin && <span>GSTIN : {d.supplier.gstin}</span>}
              </div>
            </div>
            <div className="flex min-w-0 flex-col border-b border-chestnut/40">
              <div className="grid grid-cols-[auto_1fr] content-start [&>*:nth-child(2n)]:border-r-0 sm:grid-cols-[auto_1fr_auto_1fr] sm:[&>*:nth-child(2n)]:border-r sm:[&>*:nth-child(4n)]:border-r-0">
                <Detail label={t("number")} value={<span className="font-bold">{d.assignedId}</span>} />
                <Detail label={t("dated")} value={dated(`${d.invoiceDate}T12:00:00+05:30`)} />
                <Detail label={t("billNumber")} value={d.supplierInvoiceNumber} />
                <Detail label={t("payment")} value={terms} />
                {/* the vehicle, last and alone on its row */}
                <span className={cn(cell, "border-b border-r font-medium")}>{t("vehicle")}</span>
                <span className={cn(cell, "tabular border-b sm:col-span-3 sm:border-r-0!")}>{d.vehicleNumber ?? "—"}</span>
              </div>
              <Remarks label={ti("remarks")} text={d.remarks} />
            </div>
          </div>

          {/* the items, as the invoice's columns (no HSN); sideways on a phone; at most five rows tall on the screen */}
          <div className="max-h-[294px] overflow-auto print:max-h-none print:overflow-visible">
            <table className="tabular w-full min-w-[38rem] border-collapse text-[0.8125rem] [&_td]:px-1.5 [&_th]:px-1.5">
              <thead>
                <tr className="text-left [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-ivory [&>th]:shadow-[inset_0_-1px_0_rgb(90_42_26/0.4)] print:[&>th]:static">
                  <th className={cn(cell, "w-10 border-r font-semibold")}>{ti("sl")}</th>
                  <th className={cn(cell, "border-r font-semibold")}>{ti("particulars")}</th>
                  <th className={cn(cell, "border-r text-right font-semibold")}>{ti("qty")}</th>
                  <th className={cn(cell, "border-r text-right font-semibold")}>{ts("rate")}</th>
                  <th className={cn(cell, "border-r text-right font-semibold")}>{ti("discount")}</th>
                  <th className={cn(cell, "border-r text-right font-semibold")}>{ti("taxable")}</th>
                  <th className={cn(cell, "border-r text-right font-semibold")}>{ti("gstPercent")}</th>
                  {intra ? (
                    <>
                      <th className={cn(cell, "border-r text-right font-semibold")}>CGST</th>
                      <th className={cn(cell, "border-r text-right font-semibold")}>SGST</th>
                    </>
                  ) : (
                    <th className={cn(cell, "border-r text-right font-semibold")}>IGST</th>
                  )}
                  <th className={cn(cell, LAST_COL, "text-right font-semibold")}>{ti("total")}</th>
                </tr>
              </thead>
              <tbody>
                {d.lines.map((l, i) => (
                  <tr key={l.productId} className="align-top">
                    <td className={cn(cell, "border-r")}>{i + 1}</td>
                    <td className={cn(cell, "border-r")}>{titleCase(l.name)}</td>
                    <td className={cn(cell, "border-r text-right")}>{l.quantity}</td>
                    <td className={cn(cell, "border-r text-right")}>{money(l.rate)}</td>
                    <td className={cn(cell, "border-r text-right")}>{money(l.discount)}</td>
                    <td className={cn(cell, "border-r text-right")}>{money(l.taxable)}</td>
                    <td className={cn(cell, "border-r text-right")}>{l.gstRate}%</td>
                    {intra ? (
                      <>
                        <td className={cn(cell, "border-r text-right")}>{money(halves(l.gst)[0])}</td>
                        <td className={cn(cell, "border-r text-right")}>{money(halves(l.gst)[1])}</td>
                      </>
                    ) : (
                      <td className={cn(cell, "border-r text-right")}>{money(l.gst)}</td>
                    )}
                    <td className={cn(cell, "text-right")}>{money(add(l.taxable, l.gst))}</td>
                  </tr>
                ))}
                {/* with charges: the items' Sub total, then each charge as a row */}
                {charges.length > 0 && (
                  <>
                    <tr className="border-t border-chestnut/40 font-semibold">
                      <td className={cn(cell, "border-r")} />
                      <td className={cn(cell, "border-r")}>{ti("subTotal")}</td>
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
                {/* room below the lines */}
                <tr aria-hidden>
                  {Array.from({ length: intra ? 9 : 8 }, (_, i) => (
                    <td key={i} className="h-14 border-r border-chestnut/40" />
                  ))}
                  <td />
                </tr>
                <tr className="font-bold [&>td]:sticky [&>td]:bottom-0 [&>td]:z-10 [&>td]:bg-ivory [&>td]:shadow-[inset_0_1px_0_rgb(90_42_26/0.4)] print:[&>td]:static">
                  <td className={cn(cell, "border-r")} />
                  <td className={cn(cell, "border-r")}>{ti("total")}</td>
                  <td className={cn(cell, "border-r text-right")}>{quantity}</td>
                  <td className={cn(cell, "border-r")} />
                  <td className={cn(cell, "border-r text-right")}>{money(sum((l) => l.discount))}</td>
                  <td className={cn(cell, "border-r text-right")}>{money(add(sum((l) => l.taxable), chargeSum((c) => c.taxable)))}</td>
                  <td className={cn(cell, "border-r")} />
                  {intra ? (
                    <>
                      <td className={cn(cell, "border-r text-right")}>{money(add(sum((l) => halves(l.gst)[0]), chargeSum((c) => halves(c.gst)[0])))}</td>
                      <td className={cn(cell, "border-r text-right")}>{money(add(sum((l) => halves(l.gst)[1]), chargeSum((c) => halves(c.gst)[1])))}</td>
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
          <div className="grid border-t border-chestnut/40 sm:grid-cols-[12rem_1fr]">
            <span className={cn(cell, "font-semibold sm:border-r")}>{ti("inWords")}</span>
            <span className={cell}>{amountInWords(d.total)}</span>
          </div>
        </div>
        <p className="pt-2 font-semibold">{ti("computerGenerated")}</p>
      </article>

      {/* the purchase's returns, under it */}
      <ReturnsLog returns={record.returns} />

      {/* and its edits */}
      <EditLog edits={record.edits} />
    </main>
  );
}

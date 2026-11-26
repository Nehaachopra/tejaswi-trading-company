"use client";

import { ArrowLeft, CircleAlert, Download, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Spinner } from "~/components/ui/icons/spinner";
import { amountInWords } from "~/lib/amount-words";
import { titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { HistoryTransaction } from "~/providers/history";
import { type DebitNote, useDebitNote } from "~/providers/purchase-return";


import { Breakup, DocHead, LAST_COL, Remarks } from "../done/document-parts";
import { band, cell, dated, Detail, money } from "../done/voucher";

// a button's look on the chestnut page, as on the invoice
const pill =
  "on-ivory flex min-h-11 items-center justify-center gap-2 rounded-control bg-ivory px-3 text-sm font-semibold text-chestnut disabled:opacity-50 sm:px-4";

// /transaction/purchase-return/[id]/debit-note: a purchase return as our debit note, in the credit note's frame. Our
// details beside the note's (its number and day, the supplier's bill it's against and its day, our purchase number, how
// it was settled, the supplier's credit note when they gave one, the reason), the remarks under them; who it's to (the
// supplier); the items back (quantity, a pack's rate, the discount off the line, taxable value, GST % and the GST by
// tax, total); then the breakup (the cash discount given back, the round off) closing in the amount debited, in words
// too. A cancelled one carries a CANCELLED stamp
// `history`: opened from a purchase's Returns in History: back goes to the purchase (a return is never cancelled)
export function DebitNoteView({ id, history }: { id: string; history?: { record: HistoryTransaction; isAdmin: boolean } }) {
  const t = useTranslations("transactions.purchaseReturn.note");
  const ti = useTranslations("transactions.sale.invoice");
  const tr = useTranslations("transactions.purchaseReturn");
  const th = useTranslations("history");
  const { note: d, loading, loadFailed } = useDebitNote(id);

  if (loading)
    return (
      <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
        <Spinner /> {ti("loading")}
      </p>
    );
  if (loadFailed || !d)
    return (
      <p role="alert" className="mt-16 flex items-center justify-center gap-2">
        <CircleAlert className="size-4" aria-hidden /> {ti("loadError")}
      </p>
    );

  const c = d.company;
  const cancelled = d.status === "cancelled";
  const intra = d.supplyType === "intra";
  const supplier = titleCase(d.supplier.name);
  // how it was settled, each part it has: received back, adjusted in their account
  const settled = [
    ...(d.settled.refunded > 0 ? [t("receivedBack", { amount: money(d.settled.refunded) })] : []),
    ...(d.settled.onAccount > 0 ? [t("onAccount", { amount: money(d.settled.onAccount) })] : []),
  ].join(", ");
  // the supplier's credit note, when they gave one: its number and day
  const creditNote = d.supplierCreditNote
    ? [d.supplierCreditNote.number, d.supplierCreditNote.date ? dated(`${d.supplierCreditNote.date}T12:00:00+05:30`) : null].filter(Boolean).join(", ")
    : null;
  // half of a line's GST to each of CGST and SGST (the odd paisa to SGST)
  const halves = (gst: number) => {
    const h = Math.floor((gst * 100) / 2 + 1e-6) / 100;
    return [h, Math.round((gst - h) * 100) / 100] as const;
  };
  const sum = (pick: (l: DebitNote["lines"][number]) => number) => Math.round(d.lines.reduce((a, l) => a + pick(l), 0) * 100) / 100;
  const quantity = d.lines.reduce((a, l) => a + l.quantity, 0);
  const tableTotal = Math.round((sum((l) => l.taxable) + sum((l) => l.gst)) * 100) / 100;
  // under the table: the cash discount given back, then the round off; Total first when either changes it
  const breakup =
    d.discount > 0 || d.roundOff !== 0
      ? [
          { key: "total", label: ti("total"), value: `₹${money(tableTotal)}` },
          ...(d.discount > 0 ? [{ key: "discount", label: t("discountBack"), value: `− ₹${money(d.discount)}` }] : []),
          ...(d.roundOff !== 0 ? [{ key: "roundOff", label: t("roundOff"), value: `${d.roundOff > 0 ? "+" : "−"} ₹${money(Math.abs(d.roundOff))}` }] : []),
        ]
      : [];

  return (
    <main className="mx-auto max-w-4xl px-4 pb-28 pt-6 sm:px-6">
      <h1 className="sr-only">{t("title")}</h1>

      {/* back to the return's page (from History: to its purchase), and the download (the page printed as a PDF) */}
      <div className="no-print mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <Link href={history ? `/history/${d.purchase.transactionId}` : `/transaction/purchase-return/${id}`} className="flex min-h-11 items-center gap-1.5 text-sm font-medium">
          <ArrowLeft className="size-4" aria-hidden /> {history ? d.purchase.assignedId : t("back")}
        </Link>
        <button type="button" onClick={() => window.print()} className={pill}>
          <Download className="size-4" aria-hidden /> {ti("download")}
        </button>
      </div>

      <article className="print-area on-ivory relative overflow-hidden rounded-control bg-ivory p-3 text-sm text-chestnut sm:p-5">
        <DocHead title={t("title")} jurisdiction={ti("jurisdiction", { place: c.jurisdiction })} />
        {cancelled && (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
            <span className="-rotate-[24deg] rounded-control border-4 border-danger px-5 pb-1 pt-3 font-heading text-6xl font-bold tracking-[0.06em] text-danger opacity-35 sm:text-8xl">
              {th("stamp")}
            </span>
          </div>
        )}

        <div className="border border-chestnut/40">
          {/* our details, and the note's */}
          <div className="grid sm:grid-cols-[1fr_1.5fr]">
            <div className="flex min-w-0 flex-col border-b border-chestnut/40 sm:border-r">
              <p className={band}>{c.name}</p>
              <div className={cn(cell, "flex flex-col gap-0.5 break-words")}>
                <span>{c.address}</span>
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3.5 shrink-0" aria-hidden /> {c.phone}
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <Mail className="size-3.5 shrink-0" aria-hidden /> <span className="min-w-0 break-all">{c.email}</span>
                </span>
                <span>
                  {ti("state")}: {c.state} {ti("code")}: {c.stateCode}
                </span>
                <span>GSTIN : {c.gstin}</span>
              </div>
            </div>
            <div className="flex min-w-0 flex-col border-b border-chestnut/40">
              <div className="grid grid-cols-[auto_1fr] content-start [&>*:nth-child(2n)]:border-r-0 sm:grid-cols-[auto_1fr_auto_1fr] sm:[&>*:nth-child(2n)]:border-r sm:[&>*:nth-child(4n)]:border-r-0">
                <Detail label={t("number")} value={<span className="font-bold">{d.assignedId}</span>} />
                <Detail label={ti("dated")} value={dated(`${d.noteDate}T12:00:00+05:30`)} />
                <Detail label={t("bill")} value={d.purchase.supplierInvoiceNumber} />
                <Detail label={t("billDate")} value={dated(`${d.purchase.invoiceDate}T12:00:00+05:30`)} />
                {/* our purchase number, alone on its row */}
                <span className={cn(cell, "border-b border-r font-medium")}>{t("purchase")}</span>
                <span className={cn(cell, "border-b sm:col-span-3 sm:border-r-0!")}>{d.purchase.assignedId}</span>
                {/* how it was settled (received back, or adjusted in their account; each part it has), alone
                    on its row */}
                <span className={cn(cell, "border-b border-r font-medium")}>{t("settled")}</span>
                <span className={cn(cell, "border-b sm:col-span-3 sm:border-r-0!")}>{settled}</span>
                {/* the supplier's credit note, when they gave one */}
                {creditNote && (
                  <>
                    <span className={cn(cell, "border-b border-r font-medium")}>{t("creditNote")}</span>
                    <span className={cn(cell, "border-b sm:col-span-3 sm:border-r-0!")}>{creditNote}</span>
                  </>
                )}
                {/* the reason, last and alone on its row */}
                <span className={cn(cell, "border-b border-r font-medium")}>{tr("reason")}</span>
                <span className={cn(cell, "border-b sm:col-span-3 sm:border-r-0!")}>{d.reasonKind === "other" ? d.reason : tr(`reasons.${d.reasonKind}`)}</span>
              </div>
              <Remarks label={ti("remarks")} text={d.remarks} />
            </div>
          </div>

          {/* who it's to: the supplier */}
          <div className="border-b border-chestnut/40">
            <p className={cn(band, "break-words")}>
              {t("to")}: {supplier}
            </p>
            <div className={cn(cell, "flex flex-col gap-0.5 break-words")}>
              {d.supplier.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3.5 shrink-0" aria-hidden /> {d.supplier.phone}
                </span>
              )}
              {d.supplier.gstin && <span>GSTIN : {d.supplier.gstin}</span>}
            </div>
          </div>

          {/* the items back, as the invoice's columns; sideways on a phone */}
          <div className="max-h-[294px] overflow-auto print:max-h-none print:overflow-visible">
            <table className="tabular w-full min-w-[40rem] border-collapse text-[0.8125rem] [&_td]:px-1.5 [&_th]:px-1.5">
              <thead>
                <tr className="text-left [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-ivory [&>th]:shadow-[inset_0_-1px_0_rgb(90_42_26/0.4)] print:[&>th]:static">
                  <th className={cn(cell, "w-10 border-r font-semibold")}>{ti("sl")}</th>
                  <th className={cn(cell, "border-r font-semibold")}>{ti("particulars")}</th>
                  <th className={cn(cell, "border-r font-semibold")}>HSN</th>
                  <th className={cn(cell, "border-r text-right font-semibold")}>{ti("qty")}</th>
                  <th className={cn(cell, "border-r text-right font-semibold")}>{ti("price")}</th>
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
                    <td className={cn(cell, "border-r")}>{titleCase(l.title)}</td>
                    <td className={cn(cell, "border-r")}>{l.hsn ?? ""}</td>
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
                    <td className={cn(cell, "text-right")}>{money(Math.round((l.taxable + l.gst) * 100) / 100)}</td>
                  </tr>
                ))}
                {/* room below the lines */}
                <tr aria-hidden>
                  {Array.from({ length: intra ? 10 : 9 }, (_, i) => (
                    <td key={i} className="h-14 border-r border-chestnut/40" />
                  ))}
                  <td />
                </tr>
                <tr className="font-bold [&>td]:sticky [&>td]:bottom-0 [&>td]:z-10 [&>td]:bg-ivory [&>td]:shadow-[inset_0_1px_0_rgb(90_42_26/0.4)] print:[&>td]:static">
                  <td className={cn(cell, "border-r")} />
                  <td className={cn(cell, "border-r")}>{ti("total")}</td>
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
                    <td className={cn(cell, "border-r text-right")}>{money(sum((l) => l.gst))}</td>
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
        <div className="mt-12 flex items-end justify-between gap-6">
          <p>{ti("receiver")}</p>
          <p className="font-semibold">{ti("signatory")}</p>
        </div>
      </article>
    </main>
  );
}

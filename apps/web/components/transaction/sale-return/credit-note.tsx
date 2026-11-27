"use client";

import { ArrowLeft, CircleAlert, Download, Mail, Phone, Truck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Spinner } from "~/components/ui/icons/spinner";
import { WhatsAppIcon } from "~/components/ui/icons/whatsapp-icon";
import { amountInWords } from "~/lib/amount-words";
import { titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { HistoryTransaction } from "~/providers/history";
import { type CreditNote, useCreditNote, useCreditNoteShareKey } from "~/providers/sale-return";

import { Breakup, DocHead, LAST_COL, ScreenDetails, Remarks } from "../done/document-parts";
import { ReplacementsLog } from "../../history/replacements-log";
import { band, cell, dated, Detail, money } from "../done/voucher";

// a button's look on the chestnut page, as on the invoice
const pill =
  "on-ivory flex min-h-11 items-center justify-center gap-2 rounded-control bg-ivory px-3 text-sm font-semibold text-chestnut disabled:opacity-50 sm:px-4";

// /transaction/sale-return/[id]/credit-note: a return as its credit note, in the invoice's frame. Our details beside the
// note's (its number and day, the invoice it's against and its day, the reason), the remarks under them; who it's to;
// the items back (how each was settled, quantity, a pack's price, taxable value, GST % and the GST by tax, total);
// then the breakup (the cash discount taken back, the round off) closing in the amount credited, in words too. A
// cancelled one carries a CANCELLED stamp. Sent on WhatsApp when the customer's phone is kept
// `history`: opened from a sale's Returns in History: back goes to the sale (a return is never cancelled); the sale it
// made for replaced items under it
// `shareKey`: the customer's copy from a shared link, opened without a login: only the download
export function CreditNoteView({ id, history, shareKey }: { id: string; history?: { record: HistoryTransaction; isAdmin: boolean }; shareKey?: string }) {
  const t = useTranslations("transactions.saleReturn.note");
  const tsend = useTranslations("transactions.saleReturn.send");
  const ti = useTranslations("transactions.sale.invoice");
  const tr = useTranslations("transactions.saleReturn");
  const th = useTranslations("history");
  const shared = shareKey !== undefined;
  const { note: d, loading, loadFailed } = useCreditNote(id, shareKey);
  const link = useCreditNoteShareKey(id, !shared);

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
  const buyer = d.buyer.name.trim() ? titleCase(d.buyer.name) : ti("walkIn");
  // how it was settled, each part it has: exchanged against the new sale, paid back, adjusted in their account
  const settled = [
    ...(d.exchangeSale ? [t("exchanged", { number: d.exchangeSale.assignedId })] : []),
    ...(d.settled.refunded > 0 ? [t("paidBack", { amount: money(d.settled.refunded) })] : []),
    ...(d.settled.onAccount > 0 && !d.exchangeSale ? [t("onAccount", { amount: money(d.settled.onAccount) })] : []),
  ].join(", ");
  // half of a line's GST to each of CGST and SGST (the odd paisa to SGST)
  const halves = (gst: number) => {
    const h = Math.floor((gst * 100) / 2 + 1e-6) / 100;
    return [h, Math.round((gst - h) * 100) / 100] as const;
  };
  const sum = (pick: (l: CreditNote["lines"][number]) => number) => Math.round(d.lines.reduce((a, l) => a + pick(l), 0) * 100) / 100;
  const quantity = d.lines.reduce((a, l) => a + l.quantity, 0);
  const tableTotal = Math.round((sum((l) => l.taxable) + sum((l) => l.gst)) * 100) / 100;
  // under the table: the cash discount taken back, then the round off; Total first when either changes it
  const breakup =
    d.discount > 0 || d.roundOff !== 0
      ? [
          { key: "total", label: ti("total"), value: `₹${money(tableTotal)}` },
          ...(d.discount > 0 ? [{ key: "discount", label: tr("discountBack"), value: `− ₹${money(d.discount)}` }] : []),
          ...(d.roundOff !== 0 ? [{ key: "roundOff", label: tr("roundOff"), value: `${d.roundOff > 0 ? "+" : "−"} ₹${money(Math.abs(d.roundOff))}` }] : []),
        ]
      : [];

  // WhatsApp opened on the customer's chat with a message ready to send: the note's number, the amount and the link
  // that opens it without a login
  const whatsApp = (key: string) => {
    const url = `${window.location.origin}/voucher/credit-note/${id}?k=${encodeURIComponent(key)}`;
    const text = t("whatsAppMessage", { number: d.assignedId, amount: money(d.total), company: c.name, url });
    const to = d.buyer.phone ? `91${d.buyer.phone.replace(/\D/g, "").slice(-10)}` : "";
    return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
  };
  const canShare = !shared && !cancelled && !!d.buyer.phone;
  // packs replaced later still to go, sent from here (the admin's, from History)
  const canSend = !!history?.isAdmin && !cancelled && history.record.replacementsOwed > 0;
  // how much of what was replaced has gone out (replaced now: all of it, with the return)
  const sent = history?.record.replacementsSent ?? 0;
  const share = sent > 0 ? Math.round(((sent - (history?.record.replacementsOwed ?? 0)) / sent) * 100) : history && history.record.replacements.length > 0 ? 100 : null;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-28 pt-6 sm:px-6">
      <h1 className="sr-only">{t("title")}</h1>

      {/* back to the return's page (from History: to its sale), sending it on WhatsApp, and the download (the page
          printed as a PDF); on a phone side by side, under the back link */}
      <div className="no-print mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        {shared ? (
          <span className="hidden sm:block" />
        ) : (
          <Link href={history ? `/history/${d.sale.transactionId}` : `/transaction/sale-return/${id}`} className="flex min-h-11 items-center gap-1.5 text-sm font-medium">
            <ArrowLeft className="size-4" aria-hidden /> {history ? d.sale.assignedId : t("back")}
          </Link>
        )}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:items-center">
          {/* WhatsApp only when the customer's phone is kept, and never once cancelled */}
          {canShare && (
            <button type="button" disabled={!link.key} onClick={() => window.open(whatsApp(link.key!), "_blank", "noopener")} aria-label={ti("whatsApp")} className={pill}>
              <span className="whitespace-nowrap">{ti("shareOn")}</span>
              <WhatsAppIcon className="size-4 shrink-0" />
            </button>
          )}
          <button type="button" onClick={() => window.print()} className={cn(pill, !canShare && "col-span-2")}>
            <Download className="size-4" aria-hidden /> {t("download")}
          </button>
        </div>
      </div>

      <article className="print-area on-ivory relative overflow-hidden rounded-control bg-ivory p-3 text-sm text-chestnut sm:p-5">
        <DocHead title={t("title")} screenTitle={tr("title")} jurisdiction={ti("jurisdiction", { place: c.jurisdiction })} />
        {cancelled && (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
            <span className="-rotate-[24deg] rounded-control border-4 border-danger px-5 pb-1 pt-3 font-heading text-6xl font-bold tracking-[0.06em] text-danger opacity-35 sm:text-8xl">
              {th("stamp")}
            </span>
          </div>
        )}

        <div className="flex flex-col border border-chestnut/40 print:block">
          {/* our details (printed only), and the note's */}
          <div className="grid print:grid-cols-[1fr_1.5fr]">
            <div className="hidden min-w-0 flex-col border-b border-chestnut/40 print:flex print:border-r">
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
            <div className="hidden min-w-0 flex-col border-b border-chestnut/40 print:flex">
              <div className="grid grid-cols-[auto_1fr] content-start [&>*:nth-child(2n)]:border-r-0 sm:grid-cols-[auto_1fr_auto_1fr] sm:[&>*:nth-child(2n)]:border-r sm:[&>*:nth-child(4n)]:border-r-0">
                <Detail label={t("number")} value={<span className="font-bold">{d.assignedId}</span>} />
                <Detail label={ti("dated")} value={dated(`${d.noteDate}T12:00:00+05:30`)} />
                <Detail label={t("invoice")} value={d.sale.assignedId} />
                <Detail label={t("invoiceDate")} value={dated(`${d.sale.invoiceDate}T12:00:00+05:30`)} />
                {/* how it was settled (paid back, adjusted in their account, or exchanged against a new sale; each part it
                    has), alone on its row */}
                <span className={cn(cell, "border-b border-r font-medium")}>{t("settled")}</span>
                <span className={cn(cell, "border-b sm:col-span-3 sm:border-r-0!")}>{settled}</span>
                {/* the reason, last and alone on its row */}
                <span className={cn(cell, "border-b border-r font-medium")}>{tr("reason")}</span>
                <span className={cn(cell, "border-b sm:col-span-3 sm:border-r-0!")}>{d.reasonKind === "other" ? d.reason : tr(`reasons.${d.reasonKind}`)}</span>
              </div>
              <Remarks label={ti("remarks")} text={d.remarks} />
            </div>
          </div>

          {/* on the screen: just the number, date, how it was settled, the reason and remarks (when typed) */}
          <ScreenDetails
            rows={[
              { key: "number", label: t("number"), value: <span className="font-bold">{d.assignedId}</span> },
              { key: "dated", label: ti("dated"), value: dated(`${d.noteDate}T12:00:00+05:30`) },
              { key: "settled", label: t("settled"), value: settled },
              { key: "reason", label: tr("reason"), value: d.reasonKind === "other" ? d.reason : tr(`reasons.${d.reasonKind}`) },
            ]}
            remarks={{ label: ti("remarks"), text: d.remarks }}
          />
          {/* who it's to: on the screen, on top */}
          <div className="order-first border-b border-chestnut/40 print:order-none">
            <p className={cn(band, "break-words")}>
              {t("to")}: {buyer}
            </p>
            <div className={cn(cell, "flex flex-col gap-0.5 break-words")}>
              {d.buyer.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3.5 shrink-0" aria-hidden /> {d.buyer.phone}
                </span>
              )}
              {d.buyer.gstin && <span>GSTIN : {d.buyer.gstin}</span>}
            </div>
          </div>

          {/* the items back, as the invoice's columns; sideways on a phone */}
          <div className="max-h-[294px] overflow-auto print:max-h-none print:overflow-visible">
            <table className="tabular w-full min-w-[40rem] border-collapse text-[0.8125rem] [&_td]:px-1.5 [&_th]:px-1.5">
              <thead>
                <tr className="text-left [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-chestnut [&>th]:text-ivory [&>th]:border-ivory/30 [&>th]:shadow-[inset_0_-1px_0_rgb(90_42_26/0.4)] print:[&>th]:static print:[&>th]:bg-ivory print:[&>th]:text-chestnut print:[&>th]:border-chestnut/40">
                  <th className={cn(cell, "w-10 border-r font-semibold")}>{ti("sl")}</th>
                  <th className={cn(cell, "border-r font-semibold")}>{ti("particulars")}</th>
                  <th className={cn(cell, "border-r font-semibold")}>HSN</th>
                  <th className={cn(cell, "border-r font-semibold")}>{ti("settled")}</th>
                  <th className={cn(cell, "border-r text-right font-semibold")}>{ti("qty")}</th>
                  <th className={cn(cell, "border-r text-right font-semibold")}>{ti("price")}</th>
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
                  <tr key={`${l.productId}:${l.settled}`} className="align-top">
                    <td className={cn(cell, "border-r")}>{i + 1}</td>
                    <td className={cn(cell, "border-r")}>{titleCase(l.title)}</td>
                    <td className={cn(cell, "border-r")}>{l.hsn ?? ""}</td>
                    <td className={cn(cell, "border-r")}>{ti(l.settled === "replace" ? "settledReplace" : "settledRefund")}</td>
                    <td className={cn(cell, "border-r text-right")}>{l.quantity}</td>
                    <td className={cn(cell, "border-r text-right")}>{money(l.rate)}</td>
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
                  <td className={cn(cell, "border-r")} />
                  <td className={cn(cell, "border-r text-right")}>{quantity}</td>
                  <td className={cn(cell, "border-r")} />
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
          <div className="hidden border-t border-chestnut/40 print:grid print:grid-cols-[12rem_1fr]">
            <span className={cn(cell, "font-semibold sm:border-r")}>{ti("inWords")}</span>
            <span className={cell}>{amountInWords(d.total)}</span>
          </div>
        </div>

        <p className="hidden pt-2 font-semibold print:block">{ti("computerGenerated")}</p>
        <div className="mt-12 hidden items-end justify-between gap-6 print:flex">
          <p>{ti("receiver")}</p>
          <p className="font-semibold">{ti("signatory")}</p>
        </div>
      </article>

      {/* the sales its replaced items went out on (from History), as the Returns rows, and Send replacement (the admin's,
          while packs replaced later are still to go) at the right of the heading */}
      {history && (
        <ReplacementsLog
          replacements={history.record.replacements}
          show={sent > 0}
          share={share}
          action={
            canSend && (
              <Link href={`/history/${id}/send-replacement`} className={pill}>
                <Truck className="size-4" aria-hidden /> {tsend("action")}
              </Link>
            )
          }
        />
      )}
    </main>
  );
}

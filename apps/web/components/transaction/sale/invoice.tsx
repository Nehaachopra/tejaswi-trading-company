"use client";

import { ArrowLeft, CircleAlert, Download, Flag, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import type { RouterOutputs } from "@repo/trpc/client";
import { Spinner } from "~/components/ui/icons/spinner";
import { WhatsAppIcon } from "~/components/ui/icons/whatsapp-icon";
import { amountInWords } from "~/lib/amount-words";
import { packLabel, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import { useSaleInvoice, useSaleShareKey } from "~/providers/sale";

import { Breakup, DocHead, LAST_COL, Remarks } from "../done/document-parts";
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
// line, its taxable value, GST % and the GST by tax, and its total), a Total row, then as the sale's Amount card the
// discount off and each charge on, the amount and the amount in words. It prints (or saves as a PDF) on its own. With a share key it's the customer's copy, opened
// from a link without a login: only the download, no way back into the app and nothing to share
export function SaleInvoice({ id, shareKey }: { id: string; shareKey?: string }) {
  const t = useTranslations("transactions.sale.invoice");
  const ts = useTranslations("transactions.sale");
  const shared = shareKey !== undefined;
  const doc = useSaleInvoice(id, shareKey);
  const link = useSaleShareKey(id, !shared);

  if (doc.isPending)
    return (
      <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
        <Spinner /> {t("loading")}
      </p>
    );
  if (doc.isError)
    return (
      <p role="alert" className="mt-16 flex items-center justify-center gap-2">
        <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
      </p>
    );

  const d = doc.data!;
  const c = d.company;
  // who it's billed to: their full name, never the short name (as the vouchers)
  const buyer = d.buyer.name.trim() ? titleCase(d.buyer.name) : t("walkIn");
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
  // the items with their GST: the table's Total
  const itemsTotal = Math.round((sum((l) => l.taxable) + itemsGst) * 100) / 100;
  const chargeOf = (key: Invoice["charges"][number]["key"]) => {
    const ch = d.charges.find((x) => x.key === key);
    return ch ? Math.round((ch.taxable + ch.gst) * 100) / 100 : 0;
  };
  // under the table, as the sale's Amount card: the discount off and each charge on (only those above zero); the amount
  // closes it
  const offOrOn = [
    ...(d.discount > 0 ? [{ key: "discount", label: ts("discount"), value: `− ₹${money(d.discount)}` }] : []),
    ...(["transport", "packing", "loading"] as const)
      .filter((key) => chargeOf(key) > 0)
      .map((key) => ({
        key,
        label: ts(key === "loading" ? "loadingCharges" : key),
        value: `+ ₹${money(chargeOf(key))}`,
      })),
  ];
  // Total first (the items with their GST), when something comes off or goes on
  const breakup =
    offOrOn.length > 0
      ? [{ key: "total", label: t("total"), value: `₹${money(itemsTotal)}` }, ...offOrOn]
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

      {/* back to the sale's page, sending it on WhatsApp, and the download; on a phone each button is full width, under
          the back link */}
      <div className="no-print mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        {shared ? (
          <span className="hidden sm:block" />
        ) : (
          <Link
            href={`/transaction/sale/${id}`}
            className="flex min-h-11 items-center gap-1.5 text-sm font-medium"
          >
            <ArrowLeft className="size-4" aria-hidden /> {t("back")}
          </Link>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* WhatsApp only when the buyer's phone is kept */}
          {!shared && d.buyer.phone && (
            <button
              type="button"
              disabled={!link.data}
              onClick={() => window.open(whatsApp(link.data!.key), "_blank", "noopener")}
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
        </div>
      </div>

      {/* the invoice itself */}
      <article className="print-area on-ivory relative overflow-hidden rounded-control bg-ivory p-3 text-sm text-chestnut sm:p-5">
        <DocHead title={t("title")} jurisdiction={t("jurisdiction", { place: c.jurisdiction })} />
        {/* a cancelled sale says so across the top */}
        {d.status === "cancelled" && (
          <p className="mb-2 rounded-control border border-danger px-3 py-1.5 text-center font-semibold text-danger">
            {t("cancelled")}
          </p>
        )}

        <div className="border border-chestnut/40">
          {/* our details, and the invoice's */}
          <div className="grid sm:grid-cols-[1fr_1.5fr]">
            <div className="flex min-w-0 flex-col border-b border-chestnut/40 sm:border-r">
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
              <Detail label={t("payment")} value={ts(`kinds.${d.kind}`)} />
              <Detail
                label={t("placeOfSupply")}
                value={d.shipTo.state ? `${d.shipTo.state} (${d.shipTo.stateCode ?? ""})` : null}
              />
              <Detail label={t("vehicle")} value={d.vehicleNumber} />
              <Detail
                label={t("soldBy")}
                value={d.createdByName ? titleCase(d.createdByName) : null}
              />
            </div>
            <div className={cn(cell, "border-b break-words")}>
              <span className="font-semibold">{t("terms")}:</span>
              <ol className="mt-0.5 list-decimal pl-4 text-xs">
                <li>{t("term1")}</li>
                <li>{t("term2")}</li>
              </ol>
            </div>
            <Remarks label={t("remarks")} text={d.remarks} />
            </div>
          </div>

          {/* who it's billed to, and where it goes */}
          <div className="grid border-b border-chestnut/40 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col border-b border-chestnut/40 sm:border-b-0 sm:border-r">
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
            <div className="flex min-w-0 flex-col">
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
                  <tr key={l.productId} className="align-top">
                    <td className={cn(cell, "border-r")}>{i + 1}</td>
                    {/* the category on top, then the brand and pack size */}
                    <td className={cn(cell, "border-r")}>
                      <span className="block text-xs opacity-70">{titleCase(l.category)}</span>
                      {titleCase(l.title)} {packLabel(l.packSize, l.packSizeCode)}
                    </td>
                    <td className={cn(cell, "border-r")}>{l.hsn ?? ""}</td>
                    <td className={cn(cell, "border-r text-right")}>{l.quantity}</td>
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
                {/* room below the lines, as on the voucher */}
                <tr aria-hidden>
                  {Array.from({ length: intra ? 10 : 9 }, (_, i) => (
                    <td key={i} className="h-14 border-r border-chestnut/40" />
                  ))}
                  <td />
                </tr>
                {/* the totals: how many, the discount, the taxable value, each tax and the items' total */}
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
                    {money(sum((l) => l.taxable))}
                  </td>
                  <td className={cn(cell, "border-r")} />
                  {intra ? (
                    <>
                      <td className={cn(cell, "border-r text-right")}>
                        {money(sum((l) => halves(l.gst)[0]))}
                      </td>
                      <td className={cn(cell, "border-r text-right")}>
                        {money(sum((l) => halves(l.gst)[1]))}
                      </td>
                    </>
                  ) : (
                    <td className={cn(cell, "border-r text-right")}>{money(itemsGst)}</td>
                  )}
                  <td className={cn(cell, "text-right")}>{money(itemsTotal)}</td>
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
          <div className="grid border-t border-chestnut/40 sm:grid-cols-[12rem_1fr]">
            <span className={cn(cell, "font-semibold sm:border-r")}>{t("inWords")}</span>
            <span className={cell}>{amountInWords(d.total)}</span>
          </div>
        </div>

        {/* computer generated, and the signatures */}
        <p className="pt-2 font-semibold">{t("computerGenerated")}</p>
        <div className="mt-12 flex items-end justify-between gap-6">
          <p>{t("receiver")}</p>
          <p className="font-semibold">{t("signatory")}</p>
        </div>
      </article>
    </main>
  );
}

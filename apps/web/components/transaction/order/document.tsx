"use client";

import { ArrowLeft, CircleAlert, Download, Flag, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { RouterOutputs } from "@repo/trpc/client";

import { Spinner } from "~/components/ui/spinner";
import { WhatsAppIcon } from "~/components/ui/whatsapp-icon";
import { amountInWords } from "~/lib/amount-words";
import { packLabel, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import { usePurchaseOrderDocument, usePurchaseOrderShareKey, useSharedPurchaseOrder } from "~/providers/purchase-order";

import { band, cell, dated, Detail, money } from "../done/voucher";

export type OrderDocument = RouterOutputs["orders"]["purchase"]["document"];

// a buttons' look on the chestnut page, as on the voucher
const pill = "on-ivory flex min-h-11 items-center justify-center gap-2 rounded-control bg-ivory px-3 text-sm font-semibold text-chestnut disabled:opacity-50 sm:px-4";

// WhatsApp opened on the supplier's chat (the phone given, else the one kept, else a contact to pick) with a message
// ready to send: the order number, the amount and the link that opens the order without a login
export function orderWhatsAppLink(d: OrderDocument, key: string, message: (values: Record<string, string>) => string, phone = d.supplier.phone) {
  const url = `${window.location.origin}/voucher/order/${d.order.id}?k=${encodeURIComponent(key)}`;
  const text = message({ number: d.order.orderId, amount: money(d.order.totalAmount), company: d.company.name, url });
  const to = phone ? `91${phone.replace(/\D/g, "").slice(-10)}` : "";
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

// a purchase order, laid out like the payment voucher: our details and the order's, the supplier (name, address and
// GSTIN; no phone) with the remarks beside
// it, each item's price before GST, GST %, GST, price after GST, quantity and total, a Total row, then the discount off
// that total, the amount, and the amount in words. It prints (or saves as a PDF) on its own. With a share key it's the
// supplier's copy, opened from a link without a login: only the download, no way back into the app and nothing to share
export function PurchaseOrderDocument({ id, shareKey }: { id: string; shareKey?: string }) {
  const t = useTranslations("orders.doc");
  const shared = shareKey !== undefined;
  const own = usePurchaseOrderDocument(id, !shared);
  const theirs = useSharedPurchaseOrder(id, shareKey ?? "", shared);
  const doc = shared ? theirs : own;
  const link = usePurchaseOrderShareKey(id, !shared);

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

  const d = doc.data;
  const { order: o, company: c, supplier: s } = d;
  const a = s.address;
  // each item, per pack: before GST, its GST and after GST; then the line's total (after GST × quantity)
  const rows = o.lines.map((l) => {
    const gstPerPack = Math.round(l.rateBeforeGst * l.gstRate) / 100;
    return {
      key: l.productId,
      name: `${titleCase(l.title)} ${packLabel(l.packSize, l.packSizeCode)}`,
      before: l.rateBeforeGst,
      rate: l.gstRate,
      gst: gstPerPack,
      after: Math.round((l.rateBeforeGst + gstPerPack) * 100) / 100,
      quantity: l.quantity,
      total: Math.round((l.rateBeforeGst * l.quantity - l.discount + l.gstAmount) * 100) / 100,
    };
  });
  const gstTotal = Math.round(o.lines.reduce((sum, l) => sum + l.gstAmount, 0) * 100) / 100;
  const quantity = o.lines.reduce((sum, l) => sum + l.quantity, 0);
  // the items with GST, before the order's discount
  const withGst = Math.round((o.totalAmount + o.orderDiscount) * 100) / 100;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-28 pt-6 sm:px-6">
      <h1 className="sr-only">{t("title")}</h1>

      {/* back to the order's page, sending it on WhatsApp, and the download; on a phone each button is full width,
          under the back link */}
      <div className="no-print mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        {shared ? (
          <span className="hidden sm:block" />
        ) : (
          <Link href={`/transaction/order/${id}`} className="flex min-h-11 items-center gap-1.5 text-sm font-medium">
            <ArrowLeft className="size-4" aria-hidden /> {t("back")}
          </Link>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* WhatsApp only when the supplier's phone is kept (it's asked on the saved-order page) */}
          {!shared && s.phone && (
            <button
              type="button"
              disabled={!link.data}
              onClick={() => window.open(orderWhatsAppLink(d, link.data!.key, (v) => t("whatsAppMessage", v)), "_blank", "noopener")}
              aria-label={t("whatsApp")}
              className={pill}
            >
              {/* "Share on", then the icon that says where */}
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

      {/* the order itself */}
      <article className="print-area on-ivory relative overflow-hidden rounded-control bg-ivory p-3 text-sm text-chestnut sm:p-5">
        <p className="pb-2 text-center font-heading text-2xl font-bold">{t("title")}</p>

        <div className="border border-chestnut/40">
          {/* our details, and the order's */}
          <div className="grid sm:grid-cols-[1fr_1.5fr]">
            <div className="flex flex-col border-b border-chestnut/40 sm:border-r">
              <p className={band}>{c.name}</p>
              <div className={cn(cell, "flex flex-col gap-0.5")}>
                <span>{c.address}</span>
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3.5" aria-hidden /> {c.phone}
                </span>
                <span className="flex items-center gap-1.5">
                  <Mail className="size-3.5" aria-hidden /> {c.email}
                </span>
                <span>
                  {t("state")}: {c.state} {t("code")}: {c.stateCode}
                </span>
                <span>GSTIN : {c.gstin}</span>
                <span>FSSAI No : {c.fssai}</span>
              </div>
              <p className={cn(cell, "mt-auto border-t font-semibold")}>{t("jurisdiction", { place: c.jurisdiction })}</p>
            </div>
            <div className="grid grid-cols-[auto_1fr] content-start border-b border-chestnut/40 [&>*:nth-child(2n)]:border-r-0 sm:grid-cols-[auto_1fr_auto_1fr] sm:[&>*:nth-child(2n)]:border-r sm:[&>*:nth-child(4n)]:border-r-0">
              <Detail label={t("number")} value={<span className="font-bold">{o.orderId}</span>} />
              <Detail label={t("dated")} value={dated(`${o.orderDate}T12:00:00+05:30`)} />
              <Detail label={t("expected")} value={o.expectedDeliveryDate ? dated(`${o.expectedDeliveryDate}T12:00:00+05:30`) : null} />
              <Detail label={t("orderedBy")} value={titleCase(o.orderedByName)} />
            </div>
          </div>

          {/* who it's to, with the remarks beside it */}
          <div className="grid border-b border-chestnut/40 sm:grid-cols-[1fr_1.5fr]">
            <div className="flex flex-col border-b border-chestnut/40 sm:border-b-0 sm:border-r">
              <p className={band}>
                {t("to")}: {s.shortName ?? titleCase(o.party.name)}
              </p>
              <div className={cn(cell, "flex flex-col gap-0.5")}>
                {s.shortName && <span className="font-medium">{titleCase(o.party.name)}</span>}
                {a && (
                  <>
                    <span className="flex items-start gap-1.5">
                      <Flag className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {[a.line1, a.line2, a.landmark, `${a.city} - ${a.postalCode}`]
                        .filter(Boolean)
                        .map((part) => titleCase(part!))
                        .join(", ")}
                    </span>
                    <span>
                      {t("state")}: {a.state} {t("code")}: {a.stateCode}
                    </span>
                  </>
                )}
                {a?.gstin && <span>GSTIN : {a.gstin}</span>}
              </div>
            </div>
            <div className={cn(cell, "flex flex-col gap-1")}>
              <span className="font-semibold">{t("remarks")}:</span>
              <span>{o.remarks ?? "—"}</span>
            </div>
          </div>

          {/* the items: per pack before GST, GST %, GST and after GST; then quantity and the line's total. Sideways on a
              phone */}
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[40rem] border-collapse">
              <thead>
                <tr className="border-b border-chestnut/40 text-left">
                  <th className={cn(cell, "w-10 border-r font-semibold")}>{t("sl")}</th>
                  <th className={cn(cell, "border-r font-semibold")}>{t("particulars")}</th>
                  <th className={cn(cell, "border-r text-right font-semibold")}>{t("beforeGst")}</th>
                  <th className={cn(cell, "border-r text-right font-semibold")}>{t("gstPercent")}</th>
                  <th className={cn(cell, "border-r text-right font-semibold")}>{t("gst")}</th>
                  <th className={cn(cell, "border-r text-right font-semibold")}>{t("afterGst")}</th>
                  <th className={cn(cell, "border-r text-right font-semibold")}>{t("qty")}</th>
                  <th className={cn(cell, "text-right font-semibold")}>{t("total")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.key} className="align-top">
                    <td className={cn(cell, "border-r")}>{i + 1}</td>
                    <td className={cn(cell, "border-r")}>{r.name}</td>
                    <td className={cn(cell, "border-r text-right")}>{money(r.before)}</td>
                    <td className={cn(cell, "border-r text-right")}>{r.rate}%</td>
                    <td className={cn(cell, "border-r text-right")}>{money(r.gst)}</td>
                    <td className={cn(cell, "border-r text-right")}>{money(r.after)}</td>
                    <td className={cn(cell, "border-r text-right")}>{r.quantity}</td>
                    <td className={cn(cell, "text-right")}>{money(r.total)}</td>
                  </tr>
                ))}
                {/* room below the lines, as on the voucher */}
                <tr aria-hidden>
                  {Array.from({ length: 7 }, (_, i) => (
                    <td key={i} className="h-14 border-r border-chestnut/40" />
                  ))}
                  <td />
                </tr>
                {/* the totals: all the GST, how many, and the total with GST */}
                <tr className="border-t border-chestnut/40 font-bold">
                  <td className={cn(cell, "border-r")} />
                  <td className={cn(cell, "border-r")}>{t("total")}</td>
                  <td className={cn(cell, "border-r")} />
                  <td className={cn(cell, "border-r")} />
                  <td className={cn(cell, "border-r text-right")}>{money(gstTotal)}</td>
                  <td className={cn(cell, "border-r")} />
                  <td className={cn(cell, "border-r text-right")}>{quantity}</td>
                  <td className={cn(cell, "text-right")}>{money(withGst)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* the breakup: the total, the discount off it, and the amount (chestnut); column lines only, no row lines */}
          <div className="tabular grid border-t border-chestnut/40 sm:justify-end">
            {[
              { key: "total", label: t("total"), value: `₹${money(withGst)}` },
              { key: "discount", label: t("lessDiscount"), value: `− ₹${money(o.orderDiscount)}` },
              { key: "amount", label: t("amount"), value: `₹${money(o.totalAmount)}`, strong: true },
            ].map((r) => (
              <p
                key={r.key}
                className={cn(
                  "grid grid-cols-[1fr_9rem] text-right sm:grid-cols-[10rem_9rem] sm:border-l sm:border-chestnut/40",
                  r.strong && "bg-chestnut font-heading text-base font-bold text-ivory print:bg-[#3b1f14]",
                )}
              >
                <span className={cn(cell, "border-r", r.strong && "border-ivory/35")}>{r.label}</span>
                <span className={cn(cell, "font-semibold")}>{r.value}</span>
              </p>
            ))}
          </div>

          {/* the amount in words */}
          <div className="grid border-t border-chestnut/40 sm:grid-cols-[12rem_1fr]">
            <span className={cn(cell, "font-semibold sm:border-r")}>{t("inWords")}</span>
            <span className={cell}>{amountInWords(o.totalAmount)}</span>
          </div>
        </div>

        {/* computer generated, and the signatures */}
        <p className="pt-2 font-semibold">{t("computerGenerated")}</p>
        <div className="mt-12 flex items-end justify-between gap-6">
          <p>
            {t("orderedBy")}: {titleCase(o.orderedByName)}
          </p>
          <p className="font-semibold">{t("signatory")}</p>
        </div>
      </article>
    </main>
  );
}

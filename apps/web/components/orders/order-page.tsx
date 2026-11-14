"use client";

import { ArrowLeft, Ban, Check, CircleAlert, Pencil, Truck } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { CopyButton } from "~/components/ui/copy-button";
import { PAGE } from "~/components/ui/page-styles";
import { Spinner } from "~/components/ui/spinner";
import { useSideScroll } from "~/components/ui/use-side-scroll";
import { toast } from "~/components/ui/toast";
import { packLabel, rupees, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import { useCancelOrder, useOrderProducts } from "~/providers/orders";

import { type Pack, type ProductGroup, productTitle } from "../product/products/product-tile";
import { OrderItemCard } from "./order-item-card";
import { type OrderKind, useOrderDoc } from "../transaction/order/doc-data";

// each status's colour, for its sign and word
const STATUS_TONE = { pending: "text-[#a15c07]", completed: "text-success", cancelled: "text-chestnut/60" } as const;

const eyebrow = "text-xs font-semibold uppercase tracking-[0.08em] opacity-60";
// an action by the name: its icon and word; on a phone they share the row under the name; not yet built ones stay faded
const action = "flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-control px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none sm:px-5";
// Edit and Cancel on a phone: only their icon, in a square, so Record keeps its word
const iconOnPhone = "max-sm:size-11 max-sm:flex-none max-sm:px-0";
const card = "on-ivory flex min-w-0 flex-col gap-3 rounded-control bg-ivory p-4 text-chestnut";

// a day as the page shows it: the date, then the day ("13 Nov, Fri"); with the time under it in History
const dateThenDay = (d: Date, locale: string) =>
  `${d.toLocaleDateString(`${locale}-IN`, { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}, ${d.toLocaleDateString(`${locale}-IN`, { weekday: "short", timeZone: "Asia/Kolkata" })}`;
const timeOf = (d: Date, locale: string) => d.toLocaleTimeString(`${locale}-IN`, { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

// /order/purchase/[id] and /order/sale/[id], opened from a card on the Orders page: the number (with Copy) and the day
// ordered, its status and who it's with; the items as product cards in one sideways-scrolling row (the ordered pack
// sizes, Remaining over a bar, and a History fold of each sale or purchase that moved it); the address (name, phone, address);
// the amount; the history, newest first (each sale or purchase, each edit, the order placed, a cancel); and Cancel order for the admin while
// it's pending. Each dispatch is its own sale (or arrival its own purchase), so there's no amount here
export function OrderPage({ kind, id, isAdmin }: { kind: OrderKind; id: string; isAdmin: boolean }) {
  const t = useTranslations("orders.page");
  const tl = useTranslations("orders.list");
  const locale = useLocale();
  const doc = useOrderDoc(kind, id);
  // the items row: re-measured as the cards come in
  const side = useSideScroll<HTMLUListElement>(doc.data?.order.lines.length ?? 0);
  const products = useOrderProducts();
  const cancel = useCancelOrder(kind, id);
  const [asking, setAsking] = useState(false);

  if (doc.isPending)
    return (
      <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
        <Spinner /> {tl("loading")}
      </p>
    );
  if (doc.isError || !doc.data)
    return (
      <p role="alert" className="mt-16 flex items-center justify-center gap-2">
        <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
      </p>
    );

  const { order: o, toName, to } = doc.data;
  // each pack size with its product, for the photo, category and sub-category
  const packs = new Map<string, { group: ProductGroup; pack: Pack }>();
  for (const group of products.data ?? []) for (const pack of group.packs) packs.set(pack.productId, { group, pack });
  // the order's lines put together by product, in the order first ordered: one card each
  const byProduct = new Map<string, { key: string; group: ProductGroup | null; lines: (typeof o.lines)[number][] }>();
  for (const l of o.lines) {
    const group = packs.get(l.productId)?.group ?? null;
    const key = group?.key ?? l.productId;
    const it = byProduct.get(key) ?? { key, group, lines: [] };
    it.lines.push(l);
    byProduct.set(key, it);
  }
  const items = [...byProduct.values()];
  const recordLabel = t(kind === "sale" ? "recordDispatch" : "recordArrival");
  // an item's name with its pack size, as History reads it
  const itemName = (productId: string) => {
    const found = packs.get(productId);
    return found ? `${productTitle(found.group)} ${packLabel(found.pack.packSize, found.pack.packSizeCode)}` : "";
  };
  // History's events after the order was placed, newest first: a cancel, each sale or purchase, each edit
  const events = [
    ...(o.cancelledAt ? [{ key: "cancel", at: new Date(o.cancelledAt), title: t("cancelled"), lines: [] as string[] }] : []),
    ...o.deliveries.map((d) => ({
      key: d.transactionId,
      at: new Date(d.dateTime),
      title: t(kind === "sale" ? "sale" : "purchase", { number: d.assignedId }),
      lines: [...d.items.map((x) => `${itemName(x.productId)}: ${x.quantity}`), ...(d.vehicleNumber ? [t("vehicle", { number: d.vehicleNumber })] : [])],
    })),
    ...o.edits.map((e) => ({ key: e.editId, at: new Date(e.at), title: t("edited", { name: titleCase(e.byName) }), lines: [] as string[] })),
  ].sort((x, y) => y.at.getTime() - x.at.getTime());
  const a = to.address;
  const created = new Date(o.createdAt);

  return (
    <main className={`${PAGE} flex flex-col gap-3 pb-16`}>
      <h1 className="sr-only">{o.orderId}</h1>
      <Link href={kind === "sale" ? "/order" : `/order?kind=${kind}`} className="flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium">
        <ArrowLeft className="size-4" aria-hidden /> {tl("title")}
      </Link>

      {/* the day ordered and its number (muted, with Copy), its status with its sign; who it's with, and the actions
          under it */}
      <section className={card}>
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 flex-wrap items-center gap-x-4 text-sm font-semibold text-chestnut/60">
            <span className="font-medium">{dateThenDay(new Date(`${o.orderDate}T12:00:00+05:30`), locale)}</span>
            {/* the number with Copy right beside it */}
            <span className="flex items-center">
              <span className="tabular">{o.orderId}</span>
              <CopyButton value={o.orderId} />
            </span>
          </span>
          <span className={cn("flex shrink-0 items-center gap-1.5 text-xs font-semibold", STATUS_TONE[o.status])}>
            {o.status === "pending" ? (
              <span className="status-glow size-2 rounded-full bg-current" aria-hidden />
            ) : o.status === "completed" ? (
              <Check className="size-3.5" strokeWidth={3} aria-hidden />
            ) : (
              <Ban className="size-3.5" strokeWidth={2.5} aria-hidden />
            )}
            {tl(`statuses.${o.status}`)}
          </span>
        </div>
        {/* who it's with, on one line; while pending, Record dispatch or arrival, Edit order and Cancel order (the last
            two the admin's): beside it on wider screens, under it on a phone */}
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 truncate font-heading text-2xl font-extrabold leading-tight" title={titleCase(toName)}>
            {titleCase(toName)}
          </p>
          {o.status === "pending" && (
            <span className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:flex-nowrap">
              {/* Record dispatch (a sale order) or arrival (a purchase order): the main action, filled; its page comes next */}
              <button type="button" disabled aria-label={recordLabel} title={recordLabel} className={cn(action, "bg-chestnut text-ivory")}>
                <Truck className="size-4 shrink-0" aria-hidden />
                {recordLabel}
              </button>
              {isAdmin && (
                <>
                  {/* Edit order: the order's form, started from it */}
                  <Link href={`/order/${kind}/${id}/edit`} aria-label={t("editOrder")} title={t("editOrder")} className={cn(action, iconOnPhone, "border border-chestnut/40 hover:bg-chestnut/[0.06]")}>
                    <Pencil className="size-4 shrink-0" aria-hidden />
                    <span className="max-sm:sr-only">{t("editOrder")}</span>
                  </Link>
                  {/* Cancel order, asked first */}
                  <button
                    type="button"
                    onClick={() => setAsking(true)}
                    aria-label={t("cancelOrder")}
                    title={t("cancelOrder")}
                    className={cn(action, iconOnPhone, "border border-danger text-danger hover:bg-danger/[0.06]")}
                  >
                    <Ban className="size-4 shrink-0" aria-hidden />
                    <span className="max-sm:sr-only">{t("cancelOrder")}</span>
                  </button>
                </>
              )}
            </span>
          )}
        </div>
      </section>

      {/* the items: one product card per product, in one row that scrolls sideways so what's below stays in view */}
      <section className={card}>
        <h2 className={eyebrow}>{t("items")}</h2>
        <ul
          ref={side.ref}
          onScroll={side.onScroll}
          style={side.style}
          className="-mx-1 flex touch-pan-x snap-x gap-2.5 overflow-x-auto overscroll-x-contain px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((it) => (
            <OrderItemCard
              key={it.key}
              group={it.group}
              lines={it.lines}
              deliveries={o.deliveries}
              emptyNote={t(kind === "sale" ? "nothingOut" : "nothingIn")}
              dayOf={(d) => dateThenDay(d, locale)}
            />
          ))}
        </ul>
      </section>

      <div className="grid items-start gap-3 lg:grid-cols-3">
        {/* the address: name, phone and address, a labelled row each */}
        <section className={card}>
          <h2 className={eyebrow}>{t("address")}</h2>
          <div className="flex flex-col gap-2.5 text-sm">
            <p className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
              <span className="opacity-70">{t("name")}</span>
              <span className="font-semibold">{titleCase(toName)}</span>
            </p>
            <p className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
              <span className="opacity-70">{t("phone")}</span>
              <span className="tabular font-semibold">{to.phone ? `+91 ${to.phone}` : "–"}</span>
            </p>
            <p className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
              <span className="opacity-70">{t("addressLine")}</span>
              <span className="flex flex-col font-semibold">
                {a ? (
                  <>
                    {a.line1 && <span>{titleCase(a.line1)}</span>}
                    {a.line2 && <span>{titleCase(a.line2)}</span>}
                    {a.landmark && <span>{titleCase(a.landmark)}</span>}
                    <span>
                      {titleCase(a.city)}, {titleCase(a.state)} {a.postalCode}
                    </span>
                  </>
                ) : (
                  "–"
                )}
              </span>
            </p>
          </div>
        </section>

        {/* the amount: the items' value, any discount, the GST, and the total, a labelled row each */}
        <section className={card}>
          <h2 className={eyebrow}>{t("amount")}</h2>
          <div className="tabular flex flex-col gap-2.5 text-sm">
            <p className="flex items-baseline justify-between gap-3">
              <span className="opacity-70">{t("itemsValue")}</span>
              <span className="font-semibold">{rupees(o.subtotal)}</span>
            </p>
            {o.orderDiscount > 0 && (
              <p className="flex items-baseline justify-between gap-3">
                <span className="opacity-70">{t("discount")}</span>
                <span className="font-semibold">− {rupees(o.orderDiscount)}</span>
              </p>
            )}
            <p className="flex items-baseline justify-between gap-3">
              <span className="opacity-70">{t("gst")}</span>
              <span className="font-semibold">{rupees(o.gstAmount)}</span>
            </p>
            <p className="flex items-baseline justify-between gap-3 border-t border-chestnut/15 pt-2.5">
              <span className="font-semibold">{t("total")}</span>
              <span className="font-heading text-lg font-bold">{rupees(o.totalAmount)}</span>
            </p>
          </div>
        </section>

        {/* history, newest first: a cancel, each sale or purchase (its number, items and vehicle) and each edit (who, and
            when; what changed is kept, not shown), then the order placed */}
        <section className={card}>
          <h2 className={eyebrow}>{t("history")}</h2>
          <ol className="flex flex-col">
            {events.map((e) => (
              <HistoryRow key={e.key} at={e.at} title={e.title} lines={e.lines} locale={locale} />
            ))}
            <HistoryRow
              at={created}
              title={t("ordered")}
              lines={[t("by", { name: titleCase(o.orderedByName) }), ...(o.expectedDeliveryDate ? [t("expected", { day: dateThenDay(new Date(`${o.expectedDeliveryDate}T12:00:00+05:30`), locale) })] : [])]}
              locale={locale}
              last
            />
          </ol>
        </section>
      </div>

      {/* Cancel order asks first */}
      <ConfirmDialog
        open={asking}
        title={t("cancelTitle")}
        body={t(kind === "sale" ? "cancelBodySale" : "cancelBody", { number: o.orderId })}
        confirmLabel={t("cancelOrder")}
        cancelLabel={t("keep")}
        busy={cancel.isPending}
        onConfirm={() =>
          cancel.mutate(
            { id },
            {
              onSuccess: () => setAsking(false),
              onError: (err) => toast.error(err.message),
            },
          )
        }
        onCancel={() => setAsking(false)}
      />
    </main>
  );
}

// one event in History: a dot on a line down to the next, what happened (and its details under it), and when
function HistoryRow({ at, title, lines, locale, last = false }: { at: Date; title: string; lines: string[]; locale: string; last?: boolean }) {
  return (
    <li className="relative grid grid-cols-[0.875rem_minmax(0,1fr)_auto] gap-2.5 py-2">
      {!last && <span className="absolute bottom-[-0.5rem] left-[0.3125rem] top-6 w-0.5 bg-chestnut/15" aria-hidden />}
      <span className="mt-1 size-3 rounded-full bg-chestnut" aria-hidden />
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold">{title}</span>
        {lines.map((line, i) => (
          <span key={i} className="text-xs opacity-70">
            {line}
          </span>
        ))}
      </span>
      <span className="flex flex-col text-right text-xs opacity-70">
        <span className="whitespace-nowrap">{dateThenDay(at, locale)}</span>
        <span>{timeOf(at, locale)}</span>
      </span>
    </li>
  );
}

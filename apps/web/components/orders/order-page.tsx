"use client";

import { ArrowLeft, Ban, Check, ChevronDown, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Fragment, useState } from "react";

import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { CopyButton } from "~/components/ui/copy-button";
import { PAGE } from "~/components/ui/page-styles";
import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { packLabel, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import { useCancelOrder, useOrderProducts } from "~/providers/orders";

import { type Pack, type ProductGroup, ProductImage, productTitle } from "../product/products/product-tile";
import { type OrderKind, useOrderDoc } from "../transaction/order/doc-data";

// each status's colour, for its sign and word
const STATUS_TONE = { pending: "text-[#a15c07]", completed: "text-success", cancelled: "text-chestnut/60" } as const;

const head = "whitespace-nowrap bg-[#ede3d0] px-2.5 py-2 text-left text-xs font-semibold text-chestnut/70";
const cell = "border-b border-chestnut/15 px-2.5 py-2.5 align-middle";
const eyebrow = "text-xs font-semibold uppercase tracking-[0.08em] opacity-60";
const card = "on-ivory flex min-w-0 flex-col gap-3 rounded-control bg-ivory p-4 text-chestnut";

// a day as the page shows it: the date, then the day ("13 Nov, Fri"); with the time under it in History
const dateThenDay = (d: Date, locale: string) =>
  `${d.toLocaleDateString(`${locale}-IN`, { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}, ${d.toLocaleDateString(`${locale}-IN`, { weekday: "short", timeZone: "Asia/Kolkata" })}`;
const timeOf = (d: Date, locale: string) => d.toLocaleTimeString(`${locale}-IN`, { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

// /order/purchase/[id] and /order/sale/[id], opened from a card on the Orders page: the number (with Copy) and the day
// ordered, its status and who it's with; the items as a table (details, pack, quantity, and a tracker of what's left
// with a button that unfolds each sale or purchase that moved it, as small pills); the address (name, phone, address);
// the history, newest first (each sale or purchase, the order placed, a cancel); and Cancel order for the admin while
// it's pending. Each dispatch is its own sale (or arrival its own purchase), so there's no amount here
export function OrderPage({ kind, id, isAdmin }: { kind: OrderKind; id: string; isAdmin: boolean }) {
  const t = useTranslations("orders.page");
  const tl = useTranslations("orders.list");
  const locale = useLocale();
  const doc = useOrderDoc(kind, id);
  const products = useOrderProducts();
  const cancel = useCancelOrder(kind, id);
  const [open, setOpen] = useState<Set<string>>(new Set());
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
  const toggle = (productId: string) =>
    setOpen((now) => {
      const next = new Set(now);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  const a = to.address;
  const created = new Date(o.createdAt);

  return (
    <main className={`${PAGE} flex flex-col gap-3 pb-16`}>
      <h1 className="sr-only">{o.orderId}</h1>
      <Link href="/order" className="flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium">
        <ArrowLeft className="size-4" aria-hidden /> {tl("title")}
      </Link>

      {/* its number (muted, with Copy) and the day ordered, its status with its sign, and who it's with */}
      <section className={card}>
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm font-semibold text-chestnut/60">
            <span className="tabular">{o.orderId}</span>
            <CopyButton value={o.orderId} />
            <span className="font-medium">{dateThenDay(new Date(`${o.orderDate}T12:00:00+05:30`), locale)}</span>
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
        <p className="font-heading text-2xl font-extrabold leading-tight">{titleCase(toName)}</p>
      </section>

      {/* the items: details (only the photo on a phone), pack, quantity, and a tracker of what's left; the button beside
          it unfolds the sales or purchases that moved it */}
      <section className={card}>
        <h2 className={eyebrow}>{t("items")}</h2>
        <div className="overflow-hidden rounded-control border border-chestnut/15">
          <table className="tabular w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={head}>
                  <span className="max-sm:sr-only">{t("details")}</span>
                </th>
                <th className={head}>{t("pack")}</th>
                <th className={cn(head, "text-right")}>{t("quantity")}</th>
                <th className={head}>{t("tracker")}</th>
              </tr>
            </thead>
            <tbody>
              {o.lines.map((l) => {
                const found = packs.get(l.productId);
                const left = Math.max(0, l.quantity - l.moved);
                const isOpen = open.has(l.productId);
                // the sales or purchases that moved this item, each with its date and how many
                const moves = o.deliveries.flatMap((d) => d.items.filter((x) => x.productId === l.productId).map((x) => ({ key: d.transactionId, at: new Date(d.dateTime), quantity: x.quantity })));
                return (
                  <Fragment key={l.productId}>
                    <tr>
                      <td className={cell}>
                        <span className="flex items-center gap-2.5">
                          {found && <ProductImage group={found.group} imageUrl={found.pack.imageUrl} className="size-11 shrink-0 rounded-lg [&_span]:text-lg" />}
                          <span className="min-w-0 max-sm:sr-only">
                            <span className="block truncate font-heading text-[0.95rem] font-bold leading-5">{found ? productTitle(found.group) : titleCase(l.title)}</span>
                            {found && <span className="block truncate text-[0.7rem] uppercase tracking-[0.06em] opacity-60">{titleCase(found.group.categoryName)}</span>}
                            {found && <span className="block truncate text-xs opacity-80">{titleCase(found.group.subCategoryName)}</span>}
                          </span>
                        </span>
                      </td>
                      <td className={cell}>
                        <span className="inline-flex min-h-7 items-center whitespace-nowrap rounded-control bg-chestnut px-2.5 text-xs font-semibold text-ivory">{packLabel(l.packSize, l.packSizeCode)}</span>
                      </td>
                      <td className={cn(cell, "text-right font-bold")}>{l.quantity}</td>
                      <td className={cell}>
                        <span className="flex items-center gap-2">
                          {/* how many are left (on the right) over a bar of what has moved */}
                          <span className="flex min-w-20 flex-1 flex-col gap-1.5">
                            <span className="text-right text-sm font-semibold">{t("left", { n: left })}</span>
                            <span className="h-1.5 overflow-hidden rounded-full bg-chestnut/12">
                              <span className="block h-full rounded-full bg-chestnut" style={{ width: `${Math.min(100, (l.moved / l.quantity) * 100)}%` }} />
                            </span>
                          </span>
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            aria-label={t("showMoves", { name: found ? productTitle(found.group) : titleCase(l.title) })}
                            onClick={() => toggle(l.productId)}
                            className="grid size-8 shrink-0 place-items-center rounded-lg border border-chestnut/15 hover:bg-chestnut/[0.06]"
                          >
                            <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} aria-hidden />
                          </button>
                        </span>
                      </td>
                    </tr>
                    {/* each sale or purchase that moved it: a small pill with its date and how many */}
                    {isOpen && (
                      <tr>
                        <td colSpan={4} className={cn(cell, "bg-chestnut/[0.04]")}>
                          {moves.length === 0 ? (
                            <span className="text-sm opacity-70">{t(kind === "sale" ? "nothingOut" : "nothingIn")}</span>
                          ) : (
                            <span className="flex flex-wrap gap-2">
                              {moves.map((m) => (
                                <span key={m.key} className="inline-flex items-center gap-2 rounded-lg border border-chestnut/15 bg-ivory px-2.5 py-1 text-sm">
                                  {dateThenDay(m.at, locale)} <b className="font-semibold">{m.quantity}</b>
                                </span>
                              ))}
                            </span>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
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

        {/* history, newest first: a cancel, each sale or purchase (its number, items and vehicle), the order placed */}
        <section className={card}>
          <h2 className={eyebrow}>{t("history")}</h2>
          <ol className="flex flex-col">
            {o.cancelledAt && <HistoryRow at={new Date(o.cancelledAt)} title={t("cancelled")} lines={[]} locale={locale} />}
            {[...o.deliveries].reverse().map((d) => (
              <HistoryRow
                key={d.transactionId}
                at={new Date(d.dateTime)}
                title={t(kind === "sale" ? "sale" : "purchase", { number: d.assignedId })}
                lines={[
                  ...d.items.map((x) => {
                    const found = packs.get(x.productId);
                    return `${found ? `${productTitle(found.group)} ${packLabel(found.pack.packSize, found.pack.packSizeCode)}` : ""}: ${x.quantity}`;
                  }),
                  ...(d.vehicleNumber ? [t("vehicle", { number: d.vehicleNumber })] : []),
                ]}
                locale={locale}
              />
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

      {/* Cancel order: the admin's, while it's pending; asked first */}
      {isAdmin && o.status === "pending" && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="flex min-h-11 w-full items-center justify-center rounded-control border border-[#ffb4ab]/60 px-5 text-sm font-semibold text-[#ffb4ab] sm:w-auto"
          >
            {t("cancelOrder")}
          </button>
        </div>
      )}
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
        {lines.map((line) => (
          <span key={line} className="text-xs opacity-70">
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

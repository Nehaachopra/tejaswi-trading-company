"use client";

import { Ban, Check, ChevronDown, CircleAlert, Plus } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { DateInput } from "~/components/ui/date-input";
import { Menu, MenuItem } from "~/components/ui/menu";
import { ADD_BUTTON, FILTER_BAR_UNDER_TABS, FILTER_TRIGGER, PAGE } from "~/components/ui/page-styles";
import { PageTabs } from "~/components/ui/page-tabs";
import { Spinner } from "~/components/ui/spinner";
import { titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import { usePurchaseOrders, useSaleOrders } from "~/providers/orders";

import { indiaDay } from "../account/balance";
import { orderPath } from "../transaction/order/doc-data";

type Kind = "purchase" | "sale";
type Status = "pending" | "completed" | "cancelled";
type Range = "today" | "week" | "month" | "lastMonth" | "custom";

const STATUSES: Status[] = ["pending", "completed", "cancelled"];
const RANGES: Range[] = ["today", "week", "month", "lastMonth", "custom"];

// each status's colour, for its dot and word
const STATUS_TONE: Record<Status, string> = { pending: "text-[#a15c07]", completed: "text-success", cancelled: "text-chestnut/60" };

// a day as YYYY-MM-DD, moved by whole days
const shift = (day: string, days: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// the days a range covers, in India: today, this week (from Monday), this month, last month, or the two days picked
function rangeDays(range: Range | null, picked: { from: string; to: string }) {
  const today = indiaDay(new Date());
  const monthStart = `${today.slice(0, 8)}01`;
  switch (range) {
    case "today":
      return { from: today, to: today };
    case "week":
      return { from: shift(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7)), to: today };
    case "month":
      return { from: monthStart, to: today };
    case "lastMonth": {
      const lastEnd = shift(monthStart, -1);
      return { from: `${lastEnd.slice(0, 8)}01`, to: lastEnd };
    }
    case "custom":
      return { from: picked.from || undefined, to: picked.to || undefined };
    default:
      return {};
  }
}

// a day as the cards show it: the date, then the day ("13 Nov, Fri")
const dateThenDay = (day: string, locale: string) => {
  const d = new Date(`${day}T12:00:00+05:30`);
  const date = d.toLocaleDateString(`${locale}-IN`, { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  const weekday = d.toLocaleDateString(`${locale}-IN`, { weekday: "short", timeZone: "Asia/Kolkata" });
  return `${date}, ${weekday}`;
};

// a set filter: ivory, as everywhere
const trigger = (set: boolean) => cn(FILTER_TRIGGER, set && "border-ivory bg-ivory text-chestnut");

// /order: the orders taken, as cards, newest first. Tabs for Purchase (the admin's) and Sale; + Add order goes to the
// form on Home; the filters stay under the tabs: status, the days ordered, then the supplier or customer. A card shows
// its number with its status (the pending dot softly glowing), who it's with, the day it was ordered and how many
// products; tapping it opens the order
export function OrdersBoard({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("orders");
  const tl = useTranslations("orders.list");
  const locale = useLocale();
  const [kind, setKind] = useState<Kind>(isAdmin ? "purchase" : "sale");
  const [status, setStatus] = useState<Status | null>(null);
  const [range, setRange] = useState<Range | null>(null);
  const [picked, setPicked] = useState({ from: "", to: "" });
  // the supplier or customer: their party, or (for a sale) a name kept on the order
  const [party, setParty] = useState<string | null>(null);

  // the filters the server applies; the party is picked from what came back
  const filters = { ...(status ? { status } : {}), ...rangeDays(range, picked) };
  const purchases = usePurchaseOrders(filters, kind === "purchase");
  const sales = useSaleOrders(filters, kind === "sale");
  const list = kind === "purchase" ? purchases : sales;

  // every order the same way: its number, status, who it's with (and their key), when and how many products
  const orders = (
    kind === "purchase"
      ? (purchases.data ?? []).map((o) => ({ ...o, who: o.party.name, whoKey: o.party.id }))
      : (sales.data ?? []).map((o) => ({ ...o, who: o.customer.name, whoKey: o.customer.partyId ?? `name:${o.customer.name.toLowerCase()}` }))
  ).map((o) => ({ id: o.id, orderId: o.orderId, status: o.status, orderDate: o.orderDate, itemCount: o.itemCount, who: o.who, whoKey: o.whoKey }));
  const parties = [...new Map(orders.map((o) => [o.whoKey, o.who])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const shown = party ? orders.filter((o) => o.whoKey === party) : orders;
  const partyName = parties.find(([key]) => key === party)?.[1];

  // another tab: its own supplier or customer to pick
  const pick = (next: Kind) => {
    setKind(next);
    setParty(null);
  };

  return (
    <main className={`${PAGE} pb-16`}>
      <h1 className="sr-only">{tl("title")}</h1>

      {/* Purchase (the admin's) and Sale */}
      <PageTabs
        label={tl("title")}
        tabs={(isAdmin ? (["purchase", "sale"] as Kind[]) : (["sale"] as Kind[])).map((k) => ({ key: k, label: t(`kinds.${k}`), current: kind === k, onPick: () => pick(k) }))}
      />

      {/* + Add order: the form on Home */}
      <Link href="/transaction/order" className={`mt-6 ${ADD_BUTTON}`}>
        <Plus className="size-5" aria-hidden /> {t("addOrder")}
      </Link>

      {/* the filters, under the tabs while the list scrolls: status, the days ordered, the supplier or customer */}
      <div className={`mt-2 ${FILTER_BAR_UNDER_TABS}`}>
        <Menu
          label={tl("status")}
          surface="chestnut"
          align="left"
          boxed
          triggerClassName={trigger(status !== null)}
          trigger={
            <>
              <span className="truncate">{status ? tl(`statuses.${status}`) : tl("allStatus")}</span>
              <ChevronDown className="size-4 shrink-0" aria-hidden />
            </>
          }
        >
          {(close) =>
            [null, ...STATUSES].map((s) => (
              <MenuItem
                key={s ?? "all"}
                selected={status === s}
                onClick={() => {
                  setStatus(s);
                  close();
                }}
              >
                <span className="flex-1">{s ? tl(`statuses.${s}`) : tl("allStatus")}</span>
                {status === s && <Check className="size-4" aria-hidden />}
              </MenuItem>
            ))
          }
        </Menu>

        <Menu
          label={tl("date")}
          surface="chestnut"
          align="left"
          boxed
          triggerClassName={trigger(range !== null)}
          trigger={
            <>
              <span className="truncate">{range ? tl(`ranges.${range}`) : tl("allDates")}</span>
              <ChevronDown className="size-4 shrink-0" aria-hidden />
            </>
          }
        >
          {(close) =>
            [null, ...RANGES].map((r) => (
              <MenuItem
                key={r ?? "all"}
                selected={range === r}
                onClick={() => {
                  setRange(r);
                  close();
                }}
              >
                <span className="flex-1">{r ? tl(`ranges.${r}`) : tl("allDates")}</span>
                {range === r && <Check className="size-4" aria-hidden />}
              </MenuItem>
            ))
          }
        </Menu>

        {parties.length > 0 && (
          <Menu
            label={kind === "purchase" ? tl("supplier") : tl("customer")}
            surface="chestnut"
            align="left"
            boxed
            triggerClassName={trigger(party !== null)}
            trigger={
              <>
                <span className="truncate">{partyName ? titleCase(partyName) : kind === "purchase" ? tl("allSuppliers") : tl("allCustomers")}</span>
                <ChevronDown className="size-4 shrink-0" aria-hidden />
              </>
            }
          >
            {(close) =>
              [[null, kind === "purchase" ? tl("allSuppliers") : tl("allCustomers")] as const, ...parties.map(([key, name]) => [key, titleCase(name)] as const)].map(([key, name]) => (
                <MenuItem
                  key={key ?? "all"}
                  selected={party === key}
                  onClick={() => {
                    setParty(key);
                    close();
                  }}
                >
                  <span className="flex-1 truncate">{name}</span>
                  {party === key && <Check className="size-4" aria-hidden />}
                </MenuItem>
              ))
            }
          </Menu>
        )}
      </div>

      {/* two days picked: from and to */}
      {range === "custom" && (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-md">
          <label className="flex flex-col gap-1.5 text-xs font-semibold">
            {tl("from")}
            <DateInput value={picked.from} max={picked.to || undefined} onChange={(from) => setPicked((p) => ({ ...p, from }))} calendarLabel={tl("from")} className="min-h-11 rounded-control border border-ivory/40 bg-transparent px-3 text-base font-normal text-ivory" />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold">
            {tl("to")}
            <DateInput value={picked.to} min={picked.from || undefined} onChange={(to) => setPicked((p) => ({ ...p, to }))} calendarLabel={tl("to")} className="min-h-11 rounded-control border border-ivory/40 bg-transparent px-3 text-base font-normal text-ivory" />
          </label>
        </div>
      )}

      {list.isPending ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner /> {tl("loading")}
        </p>
      ) : list.isError ? (
        <p role="alert" className="mt-16 flex items-center justify-center gap-2">
          <CircleAlert className="size-4" aria-hidden /> {tl("loadError")}
        </p>
      ) : shown.length === 0 ? (
        <p className="mt-16 text-center text-ivory/70">{tl("empty")}</p>
      ) : (
        <ul className={cn("mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3", list.isPlaceholderData && "opacity-60")}>
          {shown.map((o) => (
            <li key={o.id}>
              <Link
                href={orderPath(kind, o.id)}
                className={cn("on-ivory flex flex-col gap-2.5 rounded-control bg-ivory p-3.5 text-chestnut", o.status === "cancelled" && "opacity-65")}
              >
                {/* its number (smaller than who it's with, muted), and its status with its sign: a softly glowing dot while
                    pending, a tick once completed, a crossed circle when cancelled */}
                <span className="flex items-center justify-between gap-2">
                  <span className="tabular text-sm font-semibold text-chestnut/60">{o.orderId}</span>
                  <span className={cn("flex items-center gap-1.5 text-xs font-semibold", STATUS_TONE[o.status])}>
                    {o.status === "pending" ? (
                      <span className="status-glow size-2 rounded-full bg-current" aria-hidden />
                    ) : o.status === "completed" ? (
                      <Check className="size-3.5" strokeWidth={3} aria-hidden />
                    ) : (
                      <Ban className="size-3.5" strokeWidth={2.5} aria-hidden />
                    )}
                    {tl(`statuses.${o.status}`)}
                  </span>
                </span>
                {/* who it's with */}
                <span className="-mt-1 truncate text-base font-bold">{titleCase(o.who)}</span>
                {/* the day it was ordered, and how many products: a row each */}
                <span className="flex flex-col gap-1.5 border-t border-chestnut/15 pt-2.5 text-sm">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="opacity-70">{tl("ordered")}</span>
                    <span className="tabular text-sm font-semibold">
                      {dateThenDay(o.orderDate, locale)}
                    </span>
                  </span>
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="opacity-70">{tl("products")}</span>
                    <span className="tabular text-sm font-semibold">{o.itemCount}</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

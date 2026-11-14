"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Reveal } from "~/components/ui/reveal";
import { packLabel, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";

import { type ProductGroup, TileTop } from "../product/products/product-tile";
import type { OrderDoc } from "../transaction/order/doc-data";

type Line = OrderDoc["order"]["lines"][number];
type Delivery = OrderDoc["order"]["deliveries"][number];

// a count as Indians group it (1,00,000)
const qty = (n: number) => n.toLocaleString("en-IN");

// one product on the order page, as a product card: only the pack sizes in this order as chips on top, the name and
// photo; under them the picked pack size's Remaining over a bar of what has moved, and its History (each sale or
// purchase that moved it, with the day and how many), folded until opened. `group` is null while products load
export function OrderItemCard({
  group,
  lines,
  deliveries,
  emptyNote,
  dayOf,
}: {
  group: ProductGroup | null;
  lines: Line[];
  deliveries: Delivery[];
  emptyNote: string;
  dayOf: (d: Date) => string;
}) {
  const t = useTranslations("orders.page");
  const [selected, setSelected] = useState(lines[0]!.productId);
  const [open, setOpen] = useState(false);
  const line = lines.find((l) => l.productId === selected) ?? lines[0]!;
  const remaining = Math.max(0, line.quantity - line.moved);
  // the sales or purchases that moved the picked pack size, each with its day and how many
  const moves = deliveries.flatMap((d) =>
    d.items.filter((x) => x.productId === line.productId).map((x) => ({ key: d.transactionId, at: new Date(d.dateTime), quantity: x.quantity })),
  );
  // the product's pack sizes cut down to the ones ordered, in the product's own order
  const ordered = new Set(lines.map((l) => l.productId));
  const shown = group ? { ...group, packs: group.packs.filter((p) => ordered.has(p.productId)) } : null;
  const pack = shown?.packs.find((p) => p.productId === line.productId);

  return (
    <li className="flex w-40 shrink-0 snap-start flex-col gap-2 rounded-control border border-chestnut/15 p-2.5 sm:w-44">
      {/* pack sizes on top, the name and sub-category, the photo; just the name and pack size until products load */}
      {shown && pack ? (
        <TileTop group={shown} pack={pack} onPack={setSelected} />
      ) : (
        <>
          <span className="inline-flex min-h-8 w-fit items-center rounded-control bg-chestnut px-2.5 text-xs font-semibold text-ivory">
            {packLabel(line.packSize, line.packSizeCode)}
          </span>
          <p className="truncate font-heading text-base font-bold leading-6">{titleCase(line.title)}</p>
        </>
      )}

      {/* how many are still to move, over a bar of what has */}
      <div className="tabular flex flex-col gap-1.5">
        <p className="flex min-w-0 items-baseline justify-between gap-2 text-sm">
          <span className="min-w-0 truncate opacity-70">{t("remaining")}</span>
          <span className={cn("shrink-0 whitespace-nowrap text-base font-bold", remaining === 0 && "text-success")}>{qty(remaining)}</span>
        </p>
        <span className="h-1.5 overflow-hidden rounded-full bg-chestnut/12">
          <span className="block h-full rounded-full bg-chestnut" style={{ width: `${Math.min(100, (line.moved / line.quantity) * 100)}%` }} />
        </span>
      </div>

      {/* History: folded to its heading; open, each sale or purchase that moved it as a small pill */}
      <div className="flex flex-col">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex min-h-11 items-center justify-between gap-3 text-left"
        >
          <span className="min-w-0 truncate text-xs font-semibold uppercase tracking-[0.08em] opacity-60">{t("history")}</span>
          <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
        <Reveal show={open} gap="0px">
          {moves.length === 0 ? (
            <p className="pb-1 text-sm opacity-70">{emptyNote}</p>
          ) : (
            <span className="tabular flex flex-wrap gap-1.5 pb-1">
              {moves.map((m) => (
                <span key={m.key} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-chestnut/15 px-2 py-1 text-xs">
                  <span className="min-w-0 truncate">{dayOf(m.at)}</span> <b className="shrink-0 font-semibold">{qty(m.quantity)}</b>
                </span>
              ))}
            </span>
          )}
        </Reveal>
      </div>
    </li>
  );
}

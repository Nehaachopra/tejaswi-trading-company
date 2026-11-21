"use client";

import { dayInWords } from "~/components/ui/date-input";
import { packLabel, rupees } from "~/lib/format";

import { type Pack, type ProductGroup, ProductImage, productTitle } from "../../product/products/product-tile";
import { type SummaryItem } from "./entry-frame";

// the summary's lines shared by sale, purchase, sale order and purchase order: each builds one line of the summary
// beside the stages (a bar above them on a phone). A line with no value yet is left out by the summary

// the products: each item a small photo, its name, ×quantity (muted) and its total with GST at the end
export function productsLine<S extends string>(
  step: S,
  heading: string,
  lines: { productId: string; quantity: string }[],
  packOf: (id: string) => { group: ProductGroup; pack: Pack } | null,
  // each line's total, in paise, in the same order
  totals: number[],
): SummaryItem<S> {
  return {
    key: "products",
    step,
    heading,
    value: lines.flatMap((l, i) => {
      const found = packOf(l.productId);
      if (!found) return [];
      return [
        {
          name: `${productTitle(found.group)} ${packLabel(found.pack.packSize, found.pack.packSizeCode, found.pack.packCount)}`,
          middle: `×${(Number(l.quantity) || 0).toLocaleString("en-IN")}`,
          amount: rupees((totals[i] ?? 0) / 100),
          image: <ProductImage group={found.group} imageUrl={found.pack.imageUrl} className="size-8 rounded-md text-xs" />,
        },
      ];
    }),
  };
}

// a plain line: its heading and one answer (none: not answered yet)
export function textLine<S extends string>(key: string, step: S, heading: string, value: string | null): SummaryItem<S> {
  return { key, step, heading, value };
}

// a payment: where it went or came from, a line each (cash, or the bank account) with its amount
export function placesLine<S extends string>(
  step: S,
  heading: string,
  places: { id: string; name: string; sub?: string | null; amount: number }[],
  cashLabel: string,
): SummaryItem<S> {
  const used = places.filter((p) => p.amount > 0);
  return {
    key: "payment",
    step,
    heading,
    value: used.length === 0 ? null : used.map((p) => ({ name: p.id === "cash" ? cashLabel : `${p.name} ${p.sub ?? ""}`.trim(), amount: rupees(p.amount) })),
  };
}

// a day, in words (22 Oct 2026); shown once `shown` (the stage reached, or it was typed)
export function dateLine<S extends string>(key: string, step: S, heading: string, day: string, locale: string, shown: boolean): SummaryItem<S> {
  return { key, step, heading, value: shown && day ? dayInWords(day, locale) : null };
}

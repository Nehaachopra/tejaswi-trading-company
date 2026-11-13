"use client";

import { X } from "lucide-react";

import { packLabel, rupees, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";

import { type Pack, type ProductGroup, ProductImage, productTitle } from "../../../product/products/product-tile";
import { lineFigures, type OrderLine, useOrderEntry } from "./state";

const head = "sticky top-0 z-10 whitespace-nowrap bg-[#ede3d0] px-1.5 py-2 text-left text-xs font-semibold text-chestnut/70 first:pl-2.5";
const cell = "whitespace-nowrap border-b border-chestnut/15 px-1.5 py-2 align-middle";
// a figure as shown: ₹ and the amount, or – until there is one
const money = (v: string) => (Number(v) > 0 ? rupees(Number(v)) : "–");

type ProductRows = { group: ProductGroup; rows: { line: OrderLine; pack: Pack }[] };

// the items on the order, read only (a tap on a row opens the line card to change it), with the order's total under the
// last one; at most about six rows tall, then it scrolls with the column names held on top and the Total row held at
// the bottom. A wider screen: each
// product's details once (a small photo, its brand, category, sub-category) with each of its pack sizes: Pack,
// Price + GST, Quantity and Total, and ✕ to take it off. A phone: just four columns (the photo once per product, Pack,
// Price + GST and Quantity), nothing sideways; taking one off is on its line card
export function OrderTable() {
  const { t, lines, packOf, linesTotal } = useOrderEntry();

  // the lines by product, in the order they were added
  const byProduct = new Map<string, ProductRows>();
  for (const line of lines) {
    const found = packOf(line.productId);
    if (!found) continue;
    const entry = byProduct.get(found.group.key) ?? { group: found.group, rows: [] };
    entry.rows.push({ line, pack: found.pack });
    byProduct.set(found.group.key, entry);
  }
  const products = [...byProduct.values()];

  return (
    <>
    {/* a wider screen: the full table */}
    <div className="hidden max-h-[22rem] overflow-auto rounded-control border border-chestnut/15 [scrollbar-width:none] sm:block [&::-webkit-scrollbar]:hidden">
      {/* at least the desktop card's width, so a phone keeps the same spacing and scrolls sideways */}
      <table className="tabular w-full min-w-[40rem] border-separate border-spacing-0">
        <thead>
          <tr>
            <th className={head}>{t("details")}</th>
            <th className={head}>{t("pack")}</th>
            <th className={cn(head, "text-right")}>{t("priceGst")}</th>
            <th className={cn(head, "text-right")}>{t("quantity")}</th>
            <th className={cn(head, "text-right")}>{t("lineTotal")}</th>
            <th className={cn(head, "w-0")}>
              <span className="sr-only">{t("remove")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {products.map(({ group, rows }) =>
            rows.map(({ line, pack }, i) => (
              <TableRow key={line.productId} group={group} pack={pack} line={line} first={i === 0} span={rows.length} last={i === rows.length - 1} />
            )),
          )}
        </tbody>
        {/* under the last product, in chestnut: the order's total, under the Total column */}
        <tfoot className="sticky bottom-0 z-10">
          <tr className="bg-chestnut text-ivory">
            {/* Total, with how many items beside it in ivory */}
            <td colSpan={4} className="px-2.5 py-2.5 text-sm font-semibold">
              <span className="flex items-center gap-2">
                {t("lineTotal")}
                <span className="tabular grid h-5 min-w-5 place-items-center rounded-md bg-ivory px-1 text-xs font-semibold leading-none text-chestnut">{lines.length}</span>
              </span>
            </td>
            <td className="whitespace-nowrap px-1.5 py-2.5 text-right font-heading text-lg font-extrabold">{rupees(linesTotal)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>

    {/* a phone: four columns */}
    <div className="max-h-[22rem] overflow-y-auto rounded-control border border-chestnut/15 [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden">
      <table className="tabular w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th className={head}>
              <span className="sr-only">{t("details")}</span>
            </th>
            <th className={head}>{t("pack")}</th>
            <th className={cn(head, "text-right")}>{t("priceGst")}</th>
            <th className={cn(head, "pr-2.5 text-right")}>{t("quantity")}</th>
          </tr>
        </thead>
        <tbody>
          {products.map(({ group, rows }) =>
            rows.map(({ line, pack }, i) => (
              <PhoneRow key={line.productId} group={group} pack={pack} line={line} first={i === 0} span={rows.length} last={i === rows.length - 1} />
            )),
          )}
        </tbody>
        {/* under the last product, in chestnut: Total with how many, and the order's total under Quantity */}
        <tfoot className="sticky bottom-0 z-10">
          <tr className="bg-chestnut text-ivory">
            <td colSpan={3} className="px-2.5 py-2.5 text-sm font-semibold">
              <span className="flex items-center gap-2">
                {t("lineTotal")}
                <span className="tabular grid h-5 min-w-5 place-items-center rounded-md bg-ivory px-1 text-xs font-semibold leading-none text-chestnut">{lines.length}</span>
              </span>
            </td>
            <td className="whitespace-nowrap px-2.5 py-2.5 text-right font-heading text-lg font-extrabold">{rupees(linesTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    </>
  );
}

// a product's details: a small photo, the brand on top, then its category, then its sub-category
function Details({ group, pack }: { group: ProductGroup; pack: Pack }) {
  return (
    <div className="flex items-center gap-3.5">
      <ProductImage group={group} imageUrl={pack.imageUrl} className="size-12 shrink-0 rounded-lg [&_span]:text-lg" />
      <div className="min-w-0">
        <p className="truncate font-heading text-base font-bold leading-5">{productTitle(group)}</p>
        <p className="truncate text-[0.7rem] uppercase tracking-[0.06em] opacity-60">{titleCase(group.categoryName)}</p>
        <p className="truncate text-xs opacity-80">{titleCase(group.subCategoryName)}</p>
      </div>
    </div>
  );
}

// one pack size's row, read only; a tap on it (or on its pack chip, for the keyboard) opens the line card. The first
// of a product's rows also carries its details, spanning them all
function TableRow({ group, pack, line, first, span, last }: { group: ProductGroup; pack: Pack; line: OrderLine; first: boolean; span: number; last: boolean }) {
  const { t, setCardFor, removeLine } = useOrderEntry();
  const name = `${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode)}`;
  const open = () => setCardFor(pack.productId);
  // a row under the same product: a fainter line between them
  const under = last ? "" : "border-b-chestnut/8";
  return (
    // a row just added rises in with a fading glow (once, when it first shows)
    <tr className="row-arrive cursor-pointer hover:bg-chestnut/[0.04]" onClick={open}>
      {first && (
        <td rowSpan={span} className="min-w-36 max-w-44 border-b border-r border-chestnut/15 bg-ivory px-2.5 py-2 align-top">
          <Details group={group} pack={pack} />
        </td>
      )}
      {/* the pack chip: the row's button */}
      <td className={cn(cell, under)}>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={`${t("change")}: ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
          className="inline-flex min-h-7 shrink-0 items-center rounded-control bg-chestnut px-2.5 text-xs font-semibold text-ivory"
        >
          {packLabel(pack.packSize, pack.packSizeCode)}
        </button>
      </td>
      {/* the figures, as typed on the card */}
      <td className={cn(cell, under, "text-right font-bold")}>{money(line.priceGst)}</td>
      <td className={cn(cell, under, "text-right font-bold")}>{line.quantity}</td>
      <td className={cn(cell, under, "text-right font-bold")}>{rupees(lineFigures(line, pack.packSize, pack.gstPercent).total / 100)}</td>
      {/* ✕: take it off the order, back to the products below */}
      <td className={cn(cell, under, "w-0 pr-1")}>
        <button
          type="button"
          aria-label={`${t("remove")}: ${name}`}
          title={t("remove")}
          onClick={(e) => {
            e.stopPropagation();
            removeLine(pack.productId);
          }}
          className="ml-auto grid size-8 shrink-0 place-items-center rounded-control hover:bg-chestnut/8"
        >
          <X className="size-4" aria-hidden />
        </button>
      </td>
    </tr>
  );
}

// a phone: one pack size's row, read only; a tap on it (or on its pack chip, for the keyboard) opens the line card. The
// first of a product's rows also carries its square photo, spanning them all
function PhoneRow({ group, pack, line, first, span, last }: { group: ProductGroup; pack: Pack; line: OrderLine; first: boolean; span: number; last: boolean }) {
  const { t, setCardFor } = useOrderEntry();
  const name = `${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode)}`;
  const open = () => setCardFor(pack.productId);
  // a row under the same product: a fainter line between them
  const under = last ? "" : "border-b-chestnut/8";
  return (
    <tr className="row-arrive cursor-pointer" onClick={open}>
      {first && (
        <td rowSpan={span} className="w-15 border-b border-r border-chestnut/15 bg-ivory p-2 align-top">
          <ProductImage group={group} imageUrl={pack.imageUrl} className="size-11 rounded-lg [&_span]:text-lg" />
        </td>
      )}
      {/* the pack chip: the row's button */}
      <td className={cn(cell, under)}>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={`${t("change")}: ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
          className="inline-flex min-h-7 shrink-0 items-center rounded-control bg-chestnut px-2.5 text-xs font-semibold text-ivory"
        >
          {packLabel(pack.packSize, pack.packSizeCode)}
        </button>
      </td>
      <td className={cn(cell, under, "text-right font-bold")}>{money(line.priceGst)}</td>
      <td className={cn(cell, under, "pr-2.5 text-right font-bold")}>{line.quantity}</td>
    </tr>
  );
}

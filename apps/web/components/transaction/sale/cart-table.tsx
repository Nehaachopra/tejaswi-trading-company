"use client";

import { Trash2 } from "lucide-react";
import { Fragment } from "react";

import { packLabel, rupees, titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";

import { type Pack, type ProductGroup, ProductImage, productTitle } from "../../product/products/product-tile";
import { type CartLine, priceOf, useSaleEntry } from "./state";

const head = "sticky top-0 z-10 whitespace-nowrap bg-[#ede3d0] px-1.5 py-2 text-left text-xs font-semibold text-chestnut/70 first:pl-2.5";
const cell = "whitespace-nowrap border-b border-chestnut/15 px-1.5 py-2 align-middle";

type ProductRows = { group: ProductGroup; rows: { line: CartLine; pack: Pack; total: number }[] };

// what's in the cart, as an order's items table: read only (a tap on a row opens the product card to change it), the
// cart's total under the last one; at most five products' rows tall, then it scrolls with the column names held on top and
// the Total row held at the bottom. A wider screen: each product's details once (a small photo, its name, category |
// sub-category) beside each of its pack sizes: Pack, Price + GST, Quantity, Total and a red bin. A phone: each
// product's photo, name and category on a row across the table, then its pack sizes under it (Pack, Price + GST,
// Quantity and the bin), nothing sideways
export function CartTable() {
  const { t, lines, figures, packOf, itemsTotal } = useSaleEntry();

  // the lines by product, in the order they were added
  const byProduct = new Map<string, ProductRows>();
  lines.forEach((line, i) => {
    const found = packOf(line.productId);
    if (!found) return;
    const entry = byProduct.get(found.group.key) ?? { group: found.group, rows: [] };
    entry.rows.push({ line, pack: found.pack, total: figures[i]!.total / 100 });
    byProduct.set(found.group.key, entry);
  });
  const products = [...byProduct.values()];
  // the Total row: its name with how many beside it
  const totalName = (
    <span className="flex items-center gap-2">
      {t("lineTotal")}
      <span className="tabular grid h-5 min-w-5 place-items-center rounded-md bg-ivory px-1 text-xs font-semibold leading-none text-chestnut">{lines.length}</span>
    </span>
  );

  return (
    <>
      {/* a wider screen: the full table, five rows tall at most (the header 32px, a row 65px, the Total 48px) */}
      <div className="hidden max-h-[405px] overflow-auto rounded-control border border-chestnut/15 [scrollbar-width:none] sm:block [&::-webkit-scrollbar]:hidden">
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
              rows.map(({ line, pack, total }, i) => (
                <TableRow key={line.productId} group={group} pack={pack} line={line} total={total} first={i === 0} span={rows.length} last={i === rows.length - 1} />
              )),
            )}
          </tbody>
          <tfoot className="sticky bottom-0 z-10">
            <tr className="bg-chestnut text-ivory">
              <td colSpan={4} className="px-2.5 py-2.5 text-sm font-semibold">
                {totalName}
              </td>
              <td className="whitespace-nowrap px-1.5 py-2.5 text-right font-heading text-lg font-extrabold">{rupees(itemsTotal)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* a phone: each product across the table, then its pack sizes under it; five products tall at most (a product's
          row 61px and a pack size's 49px) */}
      <div className="max-h-[630px] overflow-y-auto rounded-control border border-chestnut/15 [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden">
        <table className="tabular w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className={head}>{t("pack")}</th>
              <th className={cn(head, "text-right")}>{t("priceGst")}</th>
              <th className={cn(head, "text-right")}>{t("quantity")}</th>
              <th className={cn(head, "w-0")}>
                <span className="sr-only">{t("remove")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {products.map(({ group, rows }) => (
              <Fragment key={group.key}>
                <tr className="row-arrive">
                  <td colSpan={4} className="max-w-0 border-b border-chestnut/8 bg-chestnut/[0.04] px-2.5 py-2">
                    <span className="flex items-center gap-3">
                      <ProductImage group={group} imageUrl={rows[0]!.pack.imageUrl} className="size-11 shrink-0 rounded-lg [&_span]:text-lg" />
                      <span className="min-w-0">
                        <span className="block truncate font-heading text-base font-bold leading-6" title={productTitle(group)}>
                          {productTitle(group)}
                        </span>
                        <span className="block truncate text-xs opacity-70">
                          {titleCase(group.categoryName)} | {titleCase(group.subCategoryName)}
                        </span>
                      </span>
                    </span>
                  </td>
                </tr>
                {rows.map(({ line, pack }, i) => (
                  <PhoneRow key={line.productId} group={group} pack={pack} line={line} last={i === rows.length - 1} />
                ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 z-10">
            <tr className="bg-chestnut text-ivory">
              <td colSpan={2} className="px-2.5 py-2.5 text-sm font-semibold">
                {totalName}
              </td>
              <td className="whitespace-nowrap px-1.5 py-2.5 text-right font-heading text-lg font-extrabold">{rupees(itemsTotal)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

// a product's details: a small photo, the name on top, then category | sub-category
function Details({ group, pack }: { group: ProductGroup; pack: Pack }) {
  return (
    <div className="flex items-center gap-3.5">
      <ProductImage group={group} imageUrl={pack.imageUrl} className="size-12 shrink-0 rounded-lg [&_span]:text-lg" />
      <div className="min-w-0">
        <p className="truncate font-heading text-base font-bold leading-5" title={productTitle(group)}>
          {productTitle(group)}
        </p>
        <p className="truncate text-xs opacity-70">
          {titleCase(group.categoryName)} | {titleCase(group.subCategoryName)}
        </p>
      </div>
    </div>
  );
}

// the pack chip that opens the product card (the row's button, for the keyboard)
function PackButton({ group, pack }: { group: ProductGroup; pack: Pack }) {
  const { t, setCardFor } = useSaleEntry();
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={`${t("change")}: ${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode)}`}
      onClick={(e) => {
        e.stopPropagation();
        setCardFor(pack.productId);
      }}
      className="inline-flex min-h-7 shrink-0 items-center rounded-control bg-chestnut px-2.5 text-xs font-semibold text-ivory"
    >
      {packLabel(pack.packSize, pack.packSizeCode)}
    </button>
  );
}

// the red bin: out of the cart, back to the products below
function BinButton({ group, pack }: { group: ProductGroup; pack: Pack }) {
  const { t, removeLine } = useSaleEntry();
  return (
    <button
      type="button"
      aria-label={`${t("remove")}: ${productTitle(group)} ${packLabel(pack.packSize, pack.packSizeCode)}`}
      title={t("remove")}
      onClick={(e) => {
        e.stopPropagation();
        removeLine(pack.productId);
      }}
      className="ml-auto grid size-8 shrink-0 place-items-center rounded-control text-danger hover:bg-danger/[0.08]"
    >
      <Trash2 className="size-4" aria-hidden />
    </button>
  );
}

// one pack size's row on a wider screen; the first of a product's rows carries its details, spanning them all
function TableRow({ group, pack, line, total, first, span, last }: { group: ProductGroup; pack: Pack; line: CartLine; total: number; first: boolean; span: number; last: boolean }) {
  const { setCardFor } = useSaleEntry();
  const under = last ? "" : "border-b-chestnut/8";
  return (
    <tr className="row-arrive cursor-pointer hover:bg-chestnut/[0.04]" onClick={() => setCardFor(pack.productId)}>
      {first && (
        <td rowSpan={span} className="min-w-36 max-w-44 border-b border-r border-chestnut/15 bg-ivory px-2.5 py-2 align-top">
          <Details group={group} pack={pack} />
        </td>
      )}
      <td className={cn(cell, under)}>
        <PackButton group={group} pack={pack} />
      </td>
      <td className={cn(cell, under, "text-right font-bold")}>{rupees(priceOf(line, pack))}</td>
      <td className={cn(cell, under, "text-right font-bold")}>{Number(line.quantity).toLocaleString("en-IN")}</td>
      <td className={cn(cell, under, "text-right font-bold")}>{rupees(total)}</td>
      <td className={cn(cell, under, "w-0 pr-1")}>
        <BinButton group={group} pack={pack} />
      </td>
    </tr>
  );
}

// a phone: one pack size's row under its product
function PhoneRow({ group, pack, line, last }: { group: ProductGroup; pack: Pack; line: CartLine; last: boolean }) {
  const { setCardFor } = useSaleEntry();
  const under = last ? "" : "border-b-chestnut/8";
  return (
    <tr className="row-arrive cursor-pointer" onClick={() => setCardFor(pack.productId)}>
      <td className={cn(cell, under, "pl-2.5")}>
        <PackButton group={group} pack={pack} />
      </td>
      <td className={cn(cell, under, "text-right font-bold")}>{rupees(priceOf(line, pack))}</td>
      <td className={cn(cell, under, "text-right font-bold")}>{Number(line.quantity).toLocaleString("en-IN")}</td>
      <td className={cn(cell, under, "w-0 pl-0.5 pr-1")}>
        <BinButton group={group} pack={pack} />
      </td>
    </tr>
  );
}

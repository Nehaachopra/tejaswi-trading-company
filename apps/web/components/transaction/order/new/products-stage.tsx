"use client";

import { rupees } from "~/lib/format";

import { ProductsStage as SharedStage } from "../../shared/products-stage";
import { ProductDetailsCard } from "./product-details-card";
import { useOrderEntry } from "./state";

// an order's products stage, on the shared one: a sale order lists pack sizes with a selling price and stock free to
// order (not held for another order), each tile its price with GST; a purchase order lists every pack size, and its
// last tile adds a new product
export function ProductsStage() {
  const { t, kind, products, categories, lines, linesTotal, setCardFor, next } = useOrderEntry();
  const sale = kind === "sale";
  return (
    <SharedStage
      products={products}
      categories={categories}
      canList={(p) => !sale || (p.unreservedQuantity > 0 && p.priceAfterGst != null)}
      taken={new Set(lines.map((l) => l.productId))}
      onAdd={setCardFor}
      badge={sale ? (p) => <span className="font-heading text-xl font-semibold">{p.priceAfterGst != null ? rupees(p.priceAfterGst) : "–"}</span> : undefined}
      newProduct={kind === "purchase"}
      count={lines.length}
      itemsTotal={linesTotal}
      onNext={next}
      noProducts={t("noProducts")}
      allTaken={t("allOnOrder")}
    >
      <ProductDetailsCard />
    </SharedStage>
  );
}

"use client";

import { rupees } from "~/lib/format";

import { ProductsStage as SharedStage } from "../shared/products-stage";
import { ProductDetailsCard } from "./product-details-card";
import { useSaleEntry } from "./state";

// a sale's products stage, on the shared one: every pack size that can be sold (priced, with free stock), each tile its
// price with GST; a dispatch on a sale order lists what the order still waits for first
export function ProductsStage() {
  const { t, products, categories, lines, itemsTotal, setCardFor, sellable, order, orderLeft, next } = useSaleEntry();
  return (
    <SharedStage
      products={products}
      categories={categories}
      canList={sellable}
      taken={new Set(lines.map((l) => l.productId))}
      onAdd={setCardFor}
      // its price with GST (– with none saved)
      badge={(p) => <span className="font-heading text-xl font-semibold">{p.priceAfterGst != null ? rupees(p.priceAfterGst) : "–"}</span>}
      // an ordered pack size with no stock to take: no Add
      canAdd={sellable}
      order={order}
      orderLeft={orderLeft}
      count={lines.length}
      itemsTotal={itemsTotal}
      onNext={() => void next()}
      noProducts={t("noProducts")}
      allTaken={t("allInCart")}
      orderDone={t("allOrderedInCart")}
    >
      <ProductDetailsCard />
    </SharedStage>
  );
}

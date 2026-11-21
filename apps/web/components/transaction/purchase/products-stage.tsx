"use client";

import { ProductsStage as SharedStage } from "../shared/products-stage";
import { ProductDetailsCard } from "./product-details-card";
import { usePurchaseEntry } from "./state";

// a purchase's products stage, on the shared one: every pack size that can be bought (it has a GST %), no price on the
// tiles (the supplier's cost is typed on the product details card); the admin's last tile adds a new product. An
// arrival on a purchase order lists what the order still waits for first
export function ProductsStage() {
  const { t, ts, isAdmin, products, categories, lines, itemsTotal, setCardFor, buyable, order, orderLeft, next } = usePurchaseEntry();
  return (
    <SharedStage
      products={products}
      categories={categories}
      canList={buyable}
      taken={new Set(lines.map((l) => l.productId))}
      onAdd={setCardFor}
      order={order}
      orderLeft={orderLeft}
      newProduct={isAdmin}
      count={lines.length}
      itemsTotal={itemsTotal}
      onNext={() => void next()}
      noProducts={t("noProducts")}
      allTaken={ts("allInCart")}
      orderDone={t("noMoreFromOrder")}
    >
      <ProductDetailsCard />
    </SharedStage>
  );
}

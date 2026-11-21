"use client";

import { useTranslations } from "next-intl";

import { CartStage as SharedStage } from "../../shared/cart-stage";
import { OrderCartCards } from "./cart-button";
import { ProductDetailsCard } from "./product-details-card";
import { useOrderEntry } from "./state";

// an order's cart stage, on the shared one: only the discount (never more than the items' price before GST, as the
// server takes it), no charges
export function CartStage() {
  const { lines, itemsValue, linesTotal, discount, setDiscount, roundOff, total } = useOrderEntry();
  const ts = useTranslations("transactions.sale");
  return (
    <SharedStage
      idPrefix="order"
      cards={<OrderCartCards />}
      count={lines.length}
      itemsTotal={linesTotal}
      discount={discount}
      setDiscount={setDiscount}
      discountMax={itemsValue}
      roundOff={roundOff}
      total={total}
      totalLabel={ts("edit.total")}
    >
      <ProductDetailsCard />
    </SharedStage>
  );
}

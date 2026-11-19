"use client";

import { CartButton } from "../shared/cart-button";
import { usePurchaseEntry } from "./state";

// the purchase's cart button: its cart, each line's rate before GST as Rate
export function PurchaseCartButton() {
  const { t, lines, figures, packOf, itemsTotal, setCardFor, removeLine, cardFor } =
    usePurchaseEntry();
  return (
    <CartButton
      rows={lines.map((l, i) => ({
        productId: l.productId,
        price: figures[i]!.rate / 100,
        quantity: Number(l.quantity) || 0,
        total: figures[i]!.total / 100,
      }))}
      packOf={packOf}
      priceLabel={t("rate")}
      itemsTotal={itemsTotal}
      onOpen={setCardFor}
      onRemove={removeLine}
      lineOpen={cardFor !== null}
    />
  );
}

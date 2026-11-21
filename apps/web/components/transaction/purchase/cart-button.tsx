"use client";

import { CartCards } from "../shared/cart-cards";
import { usePurchaseEntry } from "./state";

// the purchase's cart, a row for each line: its rate before GST as Rate, quantity and total
function useCartRows() {
  const { lines, figures } = usePurchaseEntry();
  return lines.map((l, i) => ({
    productId: l.productId,
    price: figures[i]!.rate / 100,
    quantity: Number(l.quantity) || 0,
    total: figures[i]!.total / 100,
  }));
}

// the cart's cards, on the Cart card (its amounts beside them)
export function PurchaseCartCards() {
  const { t, packOf, itemsTotal, setCardFor, removeLine } = usePurchaseEntry();
  return (
    <CartCards
      lines={useCartRows()}
      packOf={packOf}
      priceLabel={t("rate")}
      itemsTotal={itemsTotal}
      onOpen={setCardFor}
      onRemove={removeLine}
      showTotal={false}
      twoPerRow
    />
  );
}

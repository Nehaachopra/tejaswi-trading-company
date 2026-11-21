"use client";

import { CartCards } from "../../shared/cart-cards";
import { useOrderEntry } from "./state";

// the order's cart, a row for each line: a pack's rate before GST (as a purchase's), quantity and total
function useCartRows() {
  const { lines, figures } = useOrderEntry();
  return lines.map((l, i) => ({
    productId: l.productId,
    price: figures[i]!.rate / 100,
    quantity: Number(l.quantity) || 0,
    total: figures[i]!.total / 100,
  }));
}

// the cart's cards, in the Cart card (two to a row, as a sale's)
export function OrderCartCards() {
  const { t, packOf, linesTotal, setCardFor, removeLine } = useOrderEntry();
  return (
    <CartCards
      lines={useCartRows()}
      packOf={packOf}
      priceLabel={t("rate")}
      itemsTotal={linesTotal}
      onOpen={setCardFor}
      onRemove={removeLine}
      showTotal={false}
      twoPerRow
    />
  );
}

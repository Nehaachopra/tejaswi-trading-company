"use client";

import { CartButton } from "../shared/cart-button";
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

// the purchase's cart button: only the icon, the count and a ›; a tap slides the Products card to the cart
export function PurchaseCartButton({ onSlide }: { onSlide: () => void }) {
  const { t, packOf, itemsTotal, setCardFor, removeLine, cardFor } = usePurchaseEntry();
  return (
    <CartButton
      rows={useCartRows()}
      packOf={packOf}
      priceLabel={t("rate")}
      itemsTotal={itemsTotal}
      onOpen={setCardFor}
      onRemove={removeLine}
      lineOpen={cardFor !== null}
      iconOnly
      onSlide={onSlide}
    />
  );
}

// the cart's cards, in the Products card's cart panel (the Total row already shows above)
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
    />
  );
}

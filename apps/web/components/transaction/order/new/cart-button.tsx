"use client";

import { CartButton } from "../../shared/cart-button";
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

// the order's cart button: only the icon and a ›; a tap slides the Products card to the cart
export function OrderCartButton({ onSlide }: { onSlide: () => void }) {
  const { t, packOf, linesTotal, setCardFor, removeLine, cardFor } = useOrderEntry();
  return (
    <CartButton
      rows={useCartRows()}
      packOf={packOf}
      priceLabel={t("rate")}
      itemsTotal={linesTotal}
      onOpen={setCardFor}
      onRemove={removeLine}
      lineOpen={cardFor !== null}
      iconOnly
      onSlide={onSlide}
    />
  );
}

// the cart's cards, in the Products card's cart panel (the Total row already shows above)
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
    />
  );
}

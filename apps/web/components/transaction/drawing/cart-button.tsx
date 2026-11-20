"use client";

import { CartButton } from "../shared/cart-button";
import { CartCards } from "../shared/cart-cards";
import { useDrawingEntry } from "./state";

// the drawing's cart, a row for each line: a pack's cost (before GST), quantity, and the cost with the GST reversed
function useCartRows() {
  const { lines, figures } = useDrawingEntry();
  return lines.map((l, i) => ({
    productId: l.productId,
    price: figures[i]!.unit / 100,
    quantity: Number(l.quantity) || 0,
    total: figures[i]!.total / 100,
  }));
}

// the drawing's cart button: only the icon and a ›; a tap slides the Products card to the cart
export function DrawingCartButton({ onSlide }: { onSlide: () => void }) {
  const { t, packOf, goodsTotal, setCardFor, removeLine, cardFor } = useDrawingEntry();
  return (
    <CartButton
      rows={useCartRows()}
      packOf={packOf}
      priceLabel={t("cost")}
      itemsTotal={goodsTotal}
      onOpen={setCardFor}
      onRemove={removeLine}
      lineOpen={cardFor !== null}
      iconOnly
      onSlide={onSlide}
    />
  );
}

// the cart's cards, in the Products card's cart panel (the Total row already shows above)
export function DrawingCartCards() {
  const { t, packOf, goodsTotal, setCardFor, removeLine } = useDrawingEntry();
  return (
    <CartCards
      lines={useCartRows()}
      packOf={packOf}
      priceLabel={t("cost")}
      itemsTotal={goodsTotal}
      onOpen={setCardFor}
      onRemove={removeLine}
      showTotal={false}
    />
  );
}

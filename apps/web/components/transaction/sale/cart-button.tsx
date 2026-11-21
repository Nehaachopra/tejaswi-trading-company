"use client";

import { CartButton } from "../shared/cart-button";
import { CartCards } from "../shared/cart-cards";
import { useSaleEntry } from "./state";

// the sale's cart, a row for each line: a pack's rate before GST (as a purchase's), quantity and total
function useCartRows() {
  const { lines, figures, packOf } = useSaleEntry();
  return lines.flatMap((l, i) => {
    const p = packOf(l.productId)?.pack;
    return p
      ? [
          {
            productId: l.productId,
            price: figures[i]!.rate / 100,
            quantity: Number(l.quantity) || 0,
            total: figures[i]!.total / 100,
          },
        ]
      : [];
  });
}

// the sale's cart button: only the icon, the count and a ›; a tap slides the Products card to the cart
export function SaleCartButton({ onSlide }: { onSlide: () => void }) {
  const { t, packOf, itemsTotal, setCardFor, removeLine, cardFor } = useSaleEntry();
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
      filled
      onSlide={onSlide}
    />
  );
}

// the cart's cards, in the Products card's cart panel (the Total row already shows above)
export function SaleCartCards() {
  const { t, packOf, itemsTotal, setCardFor, removeLine } = useSaleEntry();
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

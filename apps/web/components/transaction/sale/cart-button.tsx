"use client";

import { CartButton } from "../shared/cart-button";
import { priceOf, useSaleEntry } from "./state";

// the sale's cart button: its cart, each line's price with GST
export function SaleCartButton() {
  const { t, lines, figures, packOf, itemsTotal, setCardFor, removeLine, cardFor } = useSaleEntry();
  return (
    <CartButton
      rows={lines.flatMap((l, i) => {
        const p = packOf(l.productId)?.pack;
        return p
          ? [
              {
                productId: l.productId,
                price: priceOf(l, p),
                quantity: Number(l.quantity) || 0,
                total: figures[i]!.total / 100,
              },
            ]
          : [];
      })}
      packOf={packOf}
      priceLabel={t("priceGst")}
      itemsTotal={itemsTotal}
      onOpen={setCardFor}
      onRemove={removeLine}
      lineOpen={cardFor !== null}
    />
  );
}

"use client";

import { SCROLL_BOX } from "../shared/cart-button";
import { CartCards, CartTotalRow } from "../shared/cart-cards";
import { LineCard } from "./line-card";
import { useReturnEntry } from "./state";

// the Items card: the sale's cart only (no products to add). On top the Items | Total row for what's coming back; then
// a card for each item the sale had, as the cart's: its price with GST, how many were sold and how many can still come
// back, and how many come back now. A tap opens its line card; the bin (once some of it is coming back) takes it out
export function ItemsCard() {
  const { t, sale, figures, chosen, lineOf, packOf, setCardFor, cardFor, removeLine } = useReturnEntry();
  const rows = sale.lines.map((l) => {
    const q = Number(lineOf(l.productId).quantity) || 0;
    return { productId: l.productId, price: l.price, quantity: q, total: figures.items.find((i) => i.productId === l.productId)?.total ?? 0 };
  });
  return (
    <div className="flex flex-col gap-4">
      <CartTotalRow count={chosen} itemsTotal={figures.itemsTotal / 100} hold={cardFor !== null} />
      <div className={SCROLL_BOX}>
        <CartCards
          lines={rows}
          packOf={packOf}
          priceLabel={t("price")}
          itemsTotal={figures.itemsTotal / 100}
          onOpen={setCardFor}
          onRemove={removeLine}
          showTotal={false}
          canRemove={(id) => (Number(lineOf(id).quantity) || 0) > 0}
          detailRows={(row) => {
            const l = sale.lines.find((x) => x.productId === row.productId)!;
            return [
              { key: "sold", label: t("sold"), value: l.sold.toLocaleString("en-IN") },
              { key: "can", label: t("canReturn"), value: l.canReturn.toLocaleString("en-IN") },
              { key: "back", label: t("returning"), value: row.quantity > 0 ? row.quantity.toLocaleString("en-IN") : "–" },
            ];
          }}
        />
      </div>
      <LineCard />
    </div>
  );
}

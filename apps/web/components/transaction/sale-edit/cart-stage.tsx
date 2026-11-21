"use client";

import { CartCards } from "../shared/cart-cards";
import { CartStage as SharedStage } from "../shared/cart-stage";
import { ProductDetailsCard } from "./product-details-card";
import { useSaleEdit } from "./state";

// shown, not typed: the edit keeps the sale's charges and discount
const keep = () => {};
const text = (n: number) => (n > 0 ? String(n) : "");

// an edit's cart stage, on the shared one: the sale's cart cards (no bin: every item stays) whose tap opens the product
// details card to change the price; the discount and charges as plain figures, as saved
export function CartStage() {
  const { t, sale, lines, figures, packOf, savedLine, itemsTotal, roundOff, total, setCardFor } = useSaleEdit();
  // a row for each item: its rate before GST, quantity and total
  const rows = lines.map((l, i) => ({
    productId: l.productId,
    price: figures[i]!.rate / 100,
    quantity: savedLine(l.productId).quantity,
    total: figures[i]!.total / 100,
  }));
  return (
    <SharedStage
      idPrefix="sale-edit"
      cards={
        <CartCards
          lines={rows}
          packOf={packOf}
          priceLabel={t("rate")}
          itemsTotal={itemsTotal}
          onOpen={setCardFor}
          onRemove={keep}
          canRemove={() => false}
          showTotal={false}
          twoPerRow
        />
      }
      count={lines.length}
      itemsTotal={itemsTotal}
      discount={text(sale.discount)}
      setDiscount={keep}
      discountMax={0}
      charges={[
        { key: "transport", label: t("transport"), value: text(sale.transportCharges), set: keep },
        { key: "packing", label: t("packing"), value: text(sale.packingCharges), set: keep },
        { key: "loading", label: t("loadingCharges"), value: text(sale.loadingCharges), set: keep },
      ]}
      roundOff={roundOff}
      total={total}
      totalLabel={t("edit.total")}
      locked
    >
      <ProductDetailsCard />
    </SharedStage>
  );
}

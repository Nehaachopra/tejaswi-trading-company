"use client";

import { CartCards } from "../shared/cart-cards";
import { CartStage as SharedStage } from "../shared/cart-stage";
import { ProductDetailsCard } from "./product-details-card";
import { usePurchaseEdit } from "./state";

// shown, not typed: the edit keeps the purchase's charges and discount
const keep = () => {};
const text = (n: number) => (n > 0 ? String(n) : "");

// an edit's cart stage, as an edited sale's: the purchase's cart cards (no bin: every item stays) whose tap opens the
// product details card to change the cost; the discount and charges as plain figures, as saved
export function CartStage() {
  const { t, te, ts, purchase, lines, figures, packOf, savedLine, itemsTotal, roundOff, total, setCardFor } = usePurchaseEdit();
  // a row for each item: its rate before GST, quantity and total
  const rows = lines.map((l, i) => ({
    productId: l.productId,
    price: figures[i]!.rate / 100,
    quantity: savedLine(l.productId).quantity,
    total: figures[i]!.total / 100,
  }));
  return (
    <SharedStage
      idPrefix="purchase-edit"
      cards={
        <CartCards
          lines={rows}
          packOf={packOf}
          priceLabel={t("rate")}
          itemsTotal={itemsTotal}
          onOpen={setCardFor}
          onRemove={keep}
          canRemove={() => false}
          // refunded, or its replacement still to come: as it was, saying why
          lockedReason={(id) => {
            const why = purchase.lockedLines.find((l) => l.productId === id)?.why;
            return why ? te(why === "refunded" ? "lockedRefunded" : "lockedPending") : null;
          }}
          showTotal={false}
          twoPerRow
        />
      }
      count={lines.length}
      itemsTotal={itemsTotal}
      discount={text(purchase.discount)}
      setDiscount={keep}
      discountMax={0}
      charges={[
        { key: "freight", label: t("freight"), value: text(purchase.freightCharges), set: keep },
        { key: "packing", label: ts("packing"), value: text(purchase.packingCharges), set: keep },
        { key: "loading", label: ts("loadingCharges"), value: text(purchase.loadingCharges), set: keep },
        { key: "other", label: t("otherCharges"), value: text(purchase.otherCharges), set: keep },
      ]}
      roundOff={roundOff}
      total={total}
      totalLabel={te("total")}
      locked
    >
      <ProductDetailsCard />
    </SharedStage>
  );
}

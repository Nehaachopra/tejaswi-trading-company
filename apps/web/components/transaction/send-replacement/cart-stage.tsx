"use client";

import { rupees } from "~/lib/format";

import { CartCards } from "../shared/cart-cards";
import { CartStage as SharedStage } from "../shared/cart-stage";
import { ProductDetailsCard } from "./product-details-card";
import { useSendEntry } from "./state";

// shown, not typed: a replacement has no discount
const keep = () => {};

// the Cart stage, on the shared cart stage (as a purchase replacement's): a card for each item still to go (no bin), two
// rows: its rate and how many were dispatched; a tap opens the product details card. On the right the items going,
// Amount, the round off and the bill's total
export function CartStage() {
  const { t, ts, pending, packOf, lineOf, figureOf, itemsTotal, roundOff, total, chosen, setCardFor } = useSendEntry();
  const rows = pending.lines.map((l) => {
    const going = Number(lineOf(l.productId).quantity) || 0;
    return { productId: l.productId, price: l.rate, quantity: l.quantity, total: figureOf(l.productId, going).total / 100 };
  });
  return (
    <SharedStage
      idPrefix="send-replacement"
      cards={
        <CartCards
          lines={rows}
          packOf={packOf}
          priceLabel={ts("rate")}
          itemsTotal={itemsTotal}
          onOpen={setCardFor}
          onRemove={keep}
          canRemove={() => false}
          showTotal={false}
          twoPerRow
          // two rows: the rate and how many were dispatched
          detailRows={(row) => [
            { key: "rate", label: ts("rate"), value: rupees(row.price) },
            { key: "dispatched", label: t("dispatched"), value: (Number(lineOf(row.productId).quantity) || 0).toLocaleString("en-IN") },
          ]}
        />
      }
      count={rows.length}
      itemCount={chosen}
      itemsTotal={itemsTotal}
      discount=""
      setDiscount={keep}
      discountMax={0}
      roundOff={roundOff}
      total={total}
      totalLabel={t("total")}
      locked
    >
      <ProductDetailsCard />
    </SharedStage>
  );
}

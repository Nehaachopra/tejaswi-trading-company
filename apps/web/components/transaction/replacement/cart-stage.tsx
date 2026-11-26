"use client";

import { rupees } from "~/lib/format";

import { CartCards } from "../shared/cart-cards";
import { CartStage as SharedStage } from "../shared/cart-stage";
import { ProductDetailsCard } from "./product-details-card";
import { useReplacement } from "./state";

// shown, not typed: a replacement has no discount
const keep = () => {};

// the Items stage, on the shared cart stage (as a purchase return's): a card for each item still to come (no bin), its
// rate and how many are to come, and once some came, how many; a tap opens the product details card. On the right the
// items that came, Amount, the round off and the bill's total
export function CartStage() {
  const { t, ts, pending, packOf, lineOf, figureOf, itemsTotal, roundOff, total, chosen, setCardFor } = useReplacement();
  const rows = pending.lines.map((l) => {
    const came = Number(lineOf(l.productId).quantity) || 0;
    return { productId: l.productId, price: l.rate, quantity: l.quantity, total: figureOf(l.productId, came).total / 100 };
  });
  return (
    <SharedStage
      idPrefix="replacement"
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
          // the rate, how many are to come, and once some came, how many
          detailRows={(row) => {
            const came = Number(lineOf(row.productId).quantity) || 0;
            return [
              { key: "rate", label: ts("rate"), value: rupees(row.price) },
              { key: "toCome", label: t("toCome"), value: row.quantity.toLocaleString("en-IN") },
              ...(came > 0 ? [{ key: "came", label: t("came"), value: came.toLocaleString("en-IN") }] : []),
            ];
          }}
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

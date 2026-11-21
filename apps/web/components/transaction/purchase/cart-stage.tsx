"use client";

import { CartStage as SharedStage } from "../shared/cart-stage";
import { PurchaseCartCards } from "./cart-button";
import { ProductDetailsCard } from "./product-details-card";
import { usePurchaseEntry } from "./state";

// a purchase's cart stage, on the shared one (as a sale's): the discount (from an order: filled in with its share of
// the order's discount), then the freight, packing, loading and other charges, each as on the bill (GST in it)
export function CartStage() {
  const { t, ts, lines, itemsTotal, discount, setDiscount, freight, setFreight, packing, setPacking, loadingCharges, setLoadingCharges, otherCharges, setOtherCharges, grossTotal, roundOff, total } =
    usePurchaseEntry();
  return (
    <SharedStage
      idPrefix="purchase"
      cards={<PurchaseCartCards />}
      count={lines.length}
      itemsTotal={itemsTotal}
      discount={discount}
      setDiscount={setDiscount}
      discountMax={grossTotal}
      charges={[
        { key: "freight", label: t("freight"), value: freight, set: setFreight },
        { key: "packing", label: ts("packing"), value: packing, set: setPacking },
        { key: "loading", label: ts("loadingCharges"), value: loadingCharges, set: setLoadingCharges },
        { key: "other", label: t("otherCharges"), value: otherCharges, set: setOtherCharges },
      ]}
      roundOff={roundOff}
      total={total}
      totalLabel={t("billTotal")}
    >
      <ProductDetailsCard />
    </SharedStage>
  );
}

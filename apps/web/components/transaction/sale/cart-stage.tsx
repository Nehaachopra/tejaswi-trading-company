"use client";

import { CartStage as SharedStage } from "../shared/cart-stage";
import { SaleCartCards } from "./cart-button";
import { ProductDetailsCard } from "./product-details-card";
import { useSaleEntry } from "./state";

// a sale's cart stage, on the shared one: the discount (from an order: filled in with its share of the order's
// discount), then the transport, packing and loading charges
export function CartStage() {
  const { t, lines, itemsTotal, discount, setDiscount, transport, setTransport, packing, setPacking, loadingCharges, setLoadingCharges, grossTotal, roundOff, total } =
    useSaleEntry();
  return (
    <SharedStage
      idPrefix="sale"
      cards={<SaleCartCards />}
      count={lines.length}
      itemsTotal={itemsTotal}
      discount={discount}
      setDiscount={setDiscount}
      discountMax={grossTotal}
      charges={[
        { key: "transport", label: t("transport"), value: transport, set: setTransport },
        { key: "packing", label: t("packing"), value: packing, set: setPacking },
        { key: "loading", label: t("loadingCharges"), value: loadingCharges, set: setLoadingCharges },
      ]}
      roundOff={roundOff}
      total={total}
      totalLabel={t("edit.total")}
    >
      <ProductDetailsCard />
    </SharedStage>
  );
}

"use client";

import { rupees } from "~/lib/format";

import { CartStage as SharedStage } from "../shared/cart-stage";
import { SaleCartCards } from "./cart-button";
import { ProductDetailsCard } from "./product-details-card";
import { useSaleEntry } from "./state";

// a sale's cart stage, on the shared one: the discount (from an order: filled in with its share of the order's
// discount), then the transport, packing and loading charges; an edit also shows what was paid and the balance left
export function CartStage() {
  const { t, lines, itemsTotal, discount, setDiscount, transport, setTransport, packing, setPacking, loadingCharges, setLoadingCharges, grossTotal, roundOff, total, isEdit, editPaid, balance } =
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
      // an edit: what was paid towards the bill (taken off, so with a minus), and what's left either way (paid over
      // shows with a minus)
      after={
        isEdit && (
          <>
            <div className="tabular flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0">{t("edit.amountPaid")}</span>
              <span className="shrink-0 whitespace-nowrap text-base font-semibold">− {rupees(editPaid)}</span>
            </div>
            <div className="tabular flex items-baseline justify-between gap-3 border-t border-chestnut/30 pt-2.5 text-sm">
              <span className="min-w-0 font-bold">{t("edit.balanceLeft")}</span>
              <span className="shrink-0 whitespace-nowrap font-heading text-lg font-bold">{balance < 0 ? `− ${rupees(-balance)}` : rupees(balance)}</span>
            </div>
          </>
        )
      }
    >
      <ProductDetailsCard />
    </SharedStage>
  );
}

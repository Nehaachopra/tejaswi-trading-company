"use client";

import { useTranslations } from "next-intl";

import { rupees } from "~/lib/format";

import { CartCards } from "../shared/cart-cards";
import { CartStage as SharedStage } from "../shared/cart-stage";
import { ProductDetailsCard, SETTLE_ICON } from "./product-details-card";
import { useReturnEntry } from "./state";

// shown, not typed: the return keeps the sale's discount and charges
const keep = () => {};

// a return's cart stage, on the shared one: every item of the sale that can still come back as the sale's cart cards
// (no bin), its price and how many, the old quantity struck off once some are coming back with what's left beside it;
// a tap opens the product details card to say how many come back. On the right what comes back: Items, Amount, the cash
// discount it gives back (when the smaller bill can't carry all of it), the round off, and the return's total
export function CartStage() {
  const { t, sale, packOf, saleLine, lineOf, figures, total, chosen, setCardFor } = useReturnEntry();
  const ts = useTranslations("transactions.sale");
  // a card for each item that can still come back
  const rows = sale.lines
    .filter((l) => l.canReturn > 0)
    .map((l) => {
      const back = Number(lineOf(l.productId).quantity) || 0;
      const value = Math.round(l.rate * 100) * back;
      return { productId: l.productId, price: l.rate, quantity: l.canReturn, total: (value + Math.round((value * l.gstRate) / 100)) / 100 };
    });
  return (
    <SharedStage
      idPrefix="sale-return"
      cards={
        <CartCards
          lines={rows}
          packOf={packOf}
          priceLabel={ts("rate")}
          itemsTotal={figures.itemsTotal / 100}
          onOpen={setCardFor}
          onRemove={keep}
          canRemove={() => false}
          showTotal={false}
          twoPerRow
          // the rate, then how many: once some come back, the old quantity struck off and what's left after it
          detailRows={(row) => {
            const back = Number(lineOf(row.productId).quantity) || 0;
            const settle = lineOf(row.productId).settle;
            const Icon = settle ? SETTLE_ICON[settle] : null;
            return [
              { key: "rate", label: ts("rate"), value: rupees(saleLine(row.productId).rate) },
              {
                key: "quantity",
                label: ts("quantity"),
                value:
                  back > 0 ? (
                    <>
                      <s className="mr-1.5 font-normal opacity-60">{row.quantity.toLocaleString("en-IN")}</s>
                      {(row.quantity - back).toLocaleString("en-IN")}
                    </>
                  ) : (
                    row.quantity.toLocaleString("en-IN")
                  ),
              },
              // once some come back: replaced or refunded, with its icon
              ...(back > 0 && settle
                ? [
                    {
                      key: "settle",
                      label: t("settleLabel"),
                      value: (
                        <span className="inline-flex items-center gap-1.5">
                          {Icon && <Icon className="size-4" aria-hidden />}
                          {t(`settle.${settle}`)}
                        </span>
                      ),
                    },
                  ]
                : []),
            ];
          }}
        />
      }
      count={rows.length}
      itemCount={chosen}
      itemsTotal={figures.itemsTotal / 100}
      discount={figures.discount > 0 ? String(figures.discount / 100) : ""}
      setDiscount={keep}
      discountMax={0}
      roundOff={figures.roundOff / 100}
      total={total}
      totalLabel={t("returnTotal")}
      locked
    >
      <ProductDetailsCard />
    </SharedStage>
  );
}

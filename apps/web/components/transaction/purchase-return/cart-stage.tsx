"use client";

import { useTranslations } from "next-intl";

import { rupees } from "~/lib/format";

import { CartCards } from "../shared/cart-cards";
import { CartStage as SharedStage } from "../shared/cart-stage";
import { ProductDetailsCard } from "./product-details-card";
import { useReturnEntry } from "./state";

// shown, not typed: the return keeps the purchase's discount and charges
const keep = () => {};

// a purchase return's cart stage, as a sale return's: every item of the purchase that can still go back as the cart
// cards (no bin), its rate and how many, the old quantity struck off once some are going back with what's left beside
// it, and its Mode (Replace or Refund) under that; a tap opens the product details card. On the right what goes back:
// Items, Amount, the cash discount it gives back, the round off, and the return's total
export function CartStage() {
  const { t, purchase, packOf, purchaseLine, lineOf, figures, total, chosen, setCardFor } = useReturnEntry();
  const ts = useTranslations("transactions.sale");
  // a card for each item that can still go back
  const rows = purchase.lines
    .filter((l) => l.canReturn > 0)
    .map((l) => {
      const back = Number(lineOf(l.productId).quantity) || 0;
      const value = Math.round(l.rate * 100) * back;
      return { productId: l.productId, price: l.rate, quantity: l.canReturn, total: (value + Math.round((value * l.gstRate) / 100)) / 100 };
    });
  return (
    <SharedStage
      idPrefix="purchase-return"
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
          // the rate, then how many: once some go back, the old quantity struck off and what's left after it
          detailRows={(row) => {
            const back = Number(lineOf(row.productId).quantity) || 0;
            const settle = lineOf(row.productId).settle;
            return [
              { key: "rate", label: ts("rate"), value: rupees(purchaseLine(row.productId).rate) },
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
              // once some go back: Mode, and the one chosen (Replace or Refund)
              ...(back > 0 && settle ? [{ key: "settle", label: t("modeLabel"), value: t(`settle.${settle}`) }] : []),
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

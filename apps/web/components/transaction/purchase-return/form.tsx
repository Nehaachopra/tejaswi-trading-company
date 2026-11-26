"use client";

import { useLocale, useTranslations } from "next-intl";

import { dayInWords } from "~/components/ui/date-input";
import { rupees } from "~/lib/format";
import { type PurchaseForReturn, usePurchaseForReturn } from "~/providers/purchase-return";

import { ProductImage } from "../../product/products/product-tile";
import type { Pickable } from "../pickers/ledger-picker";
import { EntryNote, EntryPage, NextButton, StepCard, type SummaryItem, SummaryBar, SummaryCard, SummaryLines } from "../shared/entry-frame";
import { CartStage } from "./cart-stage";
import { DetailsCard, SaveBlock } from "./details-card";
import { MoneyStage } from "./money-stage";
import { PaymentStage } from "./payment-stage";
import { ReturnEntryProvider, type ReturnStep, useReturnEntry, useReturnEntryState } from "./state";
import { SupplierStage } from "./supplier-stage";

// /history/[id]/return for a purchase (the admin's, from its Return button): a purchase return, laid out as a sale
// return: one card at a time on the left with Back and Next, and a summary on the right (a bar above the card on a
// phone). Cart (how many of each go back, the godowns they leave from, each replaced or refunded), then with any
// refunded: Cash or credit, the supplier, Payment (what they pay back into cash and banks) or Due; then Details: the
// reason, remarks, the supplier's credit note, day and Save
export function PurchaseReturnForm({ id }: { id: string }) {
  const t = useTranslations("transactions.purchaseReturn");
  const { purchase, ledger, loading, loadFailed, retry } = usePurchaseForReturn(id);

  if (loading)
    return (
      <EntryNote title={t("title")} loading>
        {t("loading")}
      </EntryNote>
    );
  if (loadFailed || !purchase)
    return (
      <EntryNote title={t("title")} failed onRetry={retry}>
        {t("loadFailed")}
      </EntryNote>
    );
  if (purchase.returnBlockedBy) return <EntryNote title={t("title")}>{t(`blocked.${purchase.returnBlockedBy}`, { day: purchase.lastDay })}</EntryNote>;
  return <ReturnEntry purchase={purchase} ledger={ledger} />;
}

function ReturnEntry({ purchase, ledger }: { purchase: PurchaseForReturn; ledger: Pickable | null }) {
  const state = useReturnEntryState({ purchase, ledger });
  return (
    <ReturnEntryProvider value={state}>
      <ReturnEntryView />
    </ReturnEntryProvider>
  );
}

// the page: what shows while its products load or can't, then the card on its own with the summary
function ReturnEntryView() {
  const { t, purchase, loading, loadFailed, retry, lines, total, chosen, refundIn, cashRefund, owedAfter, nameOf, packOf, places, complete, index, current, steps, reachable, summaryOpen, setSummaryOpen, show, next, tried, missingOf, leaveDialog, day, reasonKind, reason, remarks, noteNumber, hasRefund } =
    useReturnEntry();
  const ts = useTranslations("transactions.sale");
  const tt = useTranslations("accounts.types");
  const locale = useLocale();
  // the page names the purchase it's against
  const title = t("titleFor", { number: purchase.assignedId });

  if (loading)
    return (
      <EntryNote title={title} loading>
        {t("loading")}
      </EntryNote>
    );
  if (loadFailed)
    return (
      <EntryNote title={title} failed onRetry={retry}>
        {t("loadFailed")}
      </EntryNote>
    );

  // a line for each card answered: each item going back (photo, name, how many, Replace or Refund), cash or credit, the supplier, where the money comes in (or what's left owed), then the day, reason, remarks and
  // the supplier's credit note
  const summary: SummaryItem<ReturnStep>[] = [
    {
      key: "items",
      step: "cart",
      heading: t("steps.items"),
      value: Object.entries(lines).map(([productId, l]) => {
        const found = packOf(productId);
        // Replace or Refund where its price would be
        return {
          name: nameOf(productId),
          middle: `×${(Number(l.quantity) || 0).toLocaleString("en-IN")}`,
          amount: l.settle ? t(`settle.${l.settle}`) : "",
          image: found ? <ProductImage group={found.group} imageUrl={found.pack.imageUrl} className="size-8 rounded-md text-xs" /> : undefined,
        };
      }),
    },
    ...(hasRefund
      ? [
          { key: "money", step: "money" as const, heading: ts("steps.money"), value: refundIn ? ts(`kinds.${refundIn}`) : null },
          // the supplier, once their card is reached
          { key: "supplier", step: "supplier" as const, heading: t("steps.supplier"), value: index >= steps.indexOf("supplier") ? purchase.supplier.name : null },
          // paid back: into where; on credit: what's left owed
          cashRefund
            ? {
                key: "payment",
                step: "payment" as const,
                heading: t("steps.refund"),
                value: places.filter((p) => p.amount > 0).map((p) => ({ name: `${p.name} ${p.sub ?? ""}`.trim(), amount: rupees(p.amount) })),
              }
            : { key: "payment", step: "payment" as const, heading: ts("leftDue"), value: refundIn === "credit" && index >= steps.indexOf("payment") ? rupees(owedAfter) : null },
        ]
      : []),
    // the details, each under its own heading
    { key: "date", step: "details", heading: t("date"), value: current === "details" || reasonKind ? dayInWords(day, locale) : null },
    { key: "reason", step: "details", heading: t("reason"), value: reasonKind ? (reasonKind === "other" && reason.trim() ? reason.trim() : t(`reasons.${reasonKind}`)) : null },
    ...(remarks.trim() ? [{ key: "remarks", step: "details" as const, heading: t("remarks"), value: remarks.trim() }] : []),
    ...(noteNumber.trim() ? [{ key: "creditNote", step: "details" as const, heading: t("creditNote"), value: noteNumber.trim() }] : []),
  ];
  const linesView = (
    <SummaryLines<ReturnStep>
      type={tt("purchase_return")}
      items={summary}
      current={current}
      reachable={reachable}
      onPick={(s) => {
        setSummaryOpen(false);
        show(s);
      }}
    />
  );

  return (
    <EntryPage
      title={title}
      summaryLabel={t("summary")}
      showBar={chosen > 0}
      bar={
        <SummaryBar label={t("summary")} total={total} open={summaryOpen} onToggle={() => setSummaryOpen((o) => !o)}>
          {linesView}
        </SummaryBar>
      }
      summary={
        <SummaryCard label={t("summary")} total={total}>
          {linesView}
        </SummaryCard>
      }
    >
      {leaveDialog}
      <StepCard
        key={current}
        id={current}
        name={current === "money" ? ts("steps.money") : current === "payment" ? ts(cashRefund ? "steps.received" : "steps.due") : t(`steps.${current}`)}
        onBack={index > 0 ? () => show(steps[index - 1]!) : null}
        onChange={null}
        missing={tried && !complete[current] ? missingOf(current) : null}
        // Cash or credit waits for a pick and moves on by itself; Details saves
        end={current === "details" ? <SaveBlock /> : current === "money" ? null : <NextButton onClick={next} />}
      >
        {current === "cart" ? (
          <CartStage />
        ) : current === "money" ? (
          <MoneyStage />
        ) : current === "supplier" ? (
          <SupplierStage />
        ) : current === "payment" ? (
          <PaymentStage />
        ) : (
          <DetailsCard />
        )}
      </StepCard>
    </EntryPage>
  );
}

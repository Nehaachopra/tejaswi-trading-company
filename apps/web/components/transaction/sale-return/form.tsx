"use client";

import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";

import { dayInWords } from "~/components/ui/date-input";
import { rupees } from "~/lib/format";
import { useSaleForReturn } from "~/providers/sale-return";

import { ProductImage } from "../../product/products/product-tile";
import { EntryNote, EntryPage, NextButton, StepCard, type SummaryItem, SummaryBar, SummaryCard, SummaryLines } from "../shared/entry-frame";
import { CartStage } from "./cart-stage";
import { CustomerStage } from "./customer-stage";
import { DetailsCard, SaveBlock } from "./details-card";
import { MoneyStage } from "./money-stage";
import { PaymentStage } from "./payment-stage";
import { ReturnEntryProvider, type ReturnStep, useReturnEntry, useReturnEntryState } from "./state";
import type { SaleForReturn } from "~/providers/sale-return";
import type { Pickable } from "../pickers/ledger-picker";

// /history/[id]/return (the admin's, from a sale's Return button): a sale return, laid out like the sale: one card at a
// time on the left with Back and Next, and a summary on the right (a bar above the card on a phone). On the shared
// stages: Cart (how many of each come back, the godowns they go into, each replaced or refunded), a refund in cash or
// on credit, the customer, Payment (paid back from cash and banks, or left on their account), then Details: the
// reason, remarks, day and Save
export function ReturnForm({ id }: { id: string }) {
  const t = useTranslations("transactions.saleReturn");
  const { sale, ledger, loading, loadFailed, retry } = useSaleForReturn(id);

  if (loading)
    return (
      <EntryNote title={t("title")} loading>
        {t("loading")}
      </EntryNote>
    );
  if (loadFailed || !sale)
    return (
      <EntryNote title={t("title")} failed onRetry={retry}>
        {t("loadFailed")}
      </EntryNote>
    );
  if (sale.returnBlockedBy)
    return <EntryNote title={t("title")}>{t(`blocked.${sale.returnBlockedBy}`, { day: sale.lastDay })}</EntryNote>;
  return <ReturnEntry sale={sale} ledger={ledger} />;
}

function ReturnEntry({ sale, ledger }: { sale: SaleForReturn; ledger: Pickable | null }) {
  const state = useReturnEntryState({ sale, ledger });
  return (
    <ReturnEntryProvider value={state}>
      <ReturnEntryView />
    </ReturnEntryProvider>
  );
}

// the page: what shows while its products load or can't, then the card on its own with the summary
function ReturnEntryView() {
  const { t, sale, loading, loadFailed, retry, customerLedger, figures, total, chosen, refundIn, pickedChoice, newParty, cashRefund, owedAfter, nameOf, packOf, places, complete, index, current, steps, reachable, summaryOpen, setSummaryOpen, show, next, tried, missingOf, leaveDialog, day, reasonKind, reason, remarks, lineOf, hasReplaceNow, hasRefund, replaced, askRefundIn } =
    useReturnEntry();
  const ts = useTranslations("transactions.sale");
  const tt = useTranslations("accounts.types");
  const locale = useLocale();
  // the page names the sale it's against
  const title = t("titleFor", { number: sale.assignedId });

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

  // a line for each card answered: each item coming back (photo, name, how many, Replace or Refund), where the
  // money goes, then the day and reason
  const summary: SummaryItem<ReturnStep>[] = [
    {
      key: "items",
      step: "cart",
      heading: t("steps.items"),
      value: figures.items.map((i) => {
        const found = packOf(i.productId);
        // Replace or Refund where its price would be
        const settle = lineOf(i.productId).settle;
        return {
          name: nameOf(i.productId),
          middle: `×${i.quantity.toLocaleString("en-IN")}`,
          amount: settle ? t(`settle.${settle}`) : "",
          image: found ? <ProductImage group={found.group} imageUrl={found.pack.imageUrl} className="size-8 rounded-md text-xs" /> : undefined,
        };
      }),
    },
    // the replaced items' new sale
    ...(hasReplaceNow ? [{ key: "replaced", step: "cart" as const, heading: t("replaced"), value: rupees(replaced) }] : []),
    // a customer's refund: cash or credit
    ...(hasRefund && askRefundIn ? [{ key: "money", step: "money" as const, heading: ts("steps.money"), value: refundIn ? ts(`kinds.${refundIn}`) : null }] : []),
    // who the refund is for: the sale's customer, or a walk-in's on credit picked or added now
    ...(steps.includes("customer")
      ? [
          {
            key: "customer",
            step: "customer" as const,
            heading: ts("steps.customer"),
            value: customerLedger
              ? (customerLedger.party?.name ?? customerLedger.name)
              : pickedChoice?.kind === "ledger"
                ? pickedChoice.ledger.name
                : pickedChoice?.kind === "party" && newParty.name.trim()
                  ? newParty.name.trim()
                  : null,
          },
        ]
      : []),
    // paid back: where from; on credit: what's left owed
    ...(hasRefund
      ? [
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
    // the details, each under its own heading: the day (once on Details), why it came back, and any remarks
    { key: "date", step: "details", heading: t("date"), value: current === "details" || reasonKind ? dayInWords(day, locale) : null },
    { key: "reason", step: "details", heading: t("reason"), value: reasonKind ? (reasonKind === "other" && reason.trim() ? reason.trim() : t(`reasons.${reasonKind}`)) : null },
    ...(remarks.trim() ? [{ key: "remarks", step: "details" as const, heading: t("remarks"), value: remarks.trim() }] : []),
  ];
  const linesView = (
    <SummaryLines<ReturnStep>
      type={tt("sale_return")}
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
        name={current === "money" ? ts("steps.money") : current === "customer" ? ts("steps.customer") : current === "payment" ? ts(cashRefund ? "steps.received" : "steps.due") : t(`steps.${current}`)}
        onBack={index > 0 ? () => show(steps[index - 1]!) : null}
        onChange={null}
        missing={tried && !complete[current] ? missingOf(current) : null}
        // Cash or credit waits for a pick and move on by themselves; Details saves
        end={current === "details" ? <SaveBlock /> : current === "money" ? null : <NextButton onClick={next} />}
      >
        {current === "cart" ? (
          <CartStage />
        ) : current === "money" ? (
          <MoneyStage />
        ) : current === "customer" ? (
          <CustomerStage />
        ) : current === "payment" ? (
          <PaymentStage />
        ) : (
          <DetailsCard />
        )}
      </StepCard>
    </EntryPage>
  );
}

"use client";

import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { dayInWords } from "~/components/ui/date-input";
import { rupees } from "~/lib/format";
import { useSaleForReturn } from "~/providers/sale-return";

import { ProductImage } from "../../product/products/product-tile";
import { SaleForm } from "../sale/form";
import { EntryNote, EntryPage, NextButton, StepCard, type SummaryItem, SummaryBar, SummaryCard, SummaryLines } from "../shared/entry-frame";
import { CartStage } from "./cart-stage";
import { CustomerStage } from "./customer-stage";
import { DetailsCard, SaveBlock } from "./details-card";
import { MoneyStage } from "./money-stage";
import { PaymentStage } from "./payment-stage";
import { SettleCard } from "./settle-card";
import { type ExchangeHandoff, ReturnEntryProvider, type ReturnStep, useReturnEntry, useReturnEntryState } from "./state";
import type { SaleForReturn } from "~/providers/sale-return";

// /history/[id]/return (the admin's, from a sale's Return button): a sale return, laid out like the sale: one card at a
// time on the left with Back and Next, and a summary on the right (a bar above the card on a phone). On the shared
// stages: Cart (how many of each come back, and the godowns they go into), Exchange or Refund, a customer's refund in
// cash or on credit, Payment (paid back from cash and banks, or left on their account), then Details: the reason,
// remarks, day and Save. An exchange's Next opens the sale form for the same buyer, whose Save saves both
export function ReturnForm({ id }: { id: string }) {
  const t = useTranslations("transactions.saleReturn");
  const { sale, loading, loadFailed, retry } = useSaleForReturn(id);
  // an exchange handed on to its new sale
  const [exchange, setExchange] = useState<ExchangeHandoff | null>(null);

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
  if (exchange) return <SaleForm isAdmin exchange={exchange} onExchangeBack={() => setExchange(null)} />;
  return <ReturnEntry sale={sale} onExchange={setExchange} />;
}

function ReturnEntry({ sale, onExchange }: { sale: SaleForReturn; onExchange: (h: ExchangeHandoff) => void }) {
  const state = useReturnEntryState({ sale, onExchange });
  return (
    <ReturnEntryProvider value={state}>
      <ReturnEntryView />
    </ReturnEntryProvider>
  );
}

// the page: what shows while its products load or can't, then the card on its own with the summary
function ReturnEntryView() {
  const { t, sale, loading, loadFailed, retry, figures, total, chosen, mode, refundIn, pickedChoice, newParty, cashRefund, owedAfter, nameOf, packOf, places, complete, index, current, steps, reachable, summaryOpen, setSummaryOpen, show, next, tried, missingOf, leaveDialog, day, reasonKind, reason, remarks } =
    useReturnEntry();
  const ts = useTranslations("transactions.sale");
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

  // a line for each card answered: each item coming back (photo, name, how many, its total), the total, Exchange or
  // Refund, where the money goes, then the day and reason
  const summary: SummaryItem<ReturnStep>[] = [
    {
      key: "items",
      step: "cart",
      heading: t("steps.items"),
      value: figures.items.map((i) => {
        const found = packOf(i.productId);
        return {
          name: nameOf(i.productId),
          middle: `×${i.quantity.toLocaleString("en-IN")}`,
          amount: rupees(i.total / 100),
          image: found ? <ProductImage group={found.group} imageUrl={found.pack.imageUrl} className="size-8 rounded-md text-xs" /> : undefined,
        };
      }),
    },
    { key: "settle", step: "settle", heading: t("returnType"), value: mode ? t(`modes.${mode}`) : null },
    // a customer's refund: cash or credit
    ...(mode === "refund" ? [{ key: "money", step: "money" as const, heading: ts("steps.money"), value: refundIn ? ts(`kinds.${refundIn}`) : null }] : []),
    // a walk-in's refund on credit: who it goes to
    ...(steps.includes("customer")
      ? [
          {
            key: "customer",
            step: "customer" as const,
            heading: ts("steps.customer"),
            value: pickedChoice?.kind === "ledger" ? pickedChoice.ledger.name : pickedChoice?.kind === "party" && newParty.name.trim() ? newParty.name.trim() : null,
          },
        ]
      : []),
    // paid back: where from; on credit: what's left owed
    ...(mode === "refund"
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
      type={t("title")}
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
        // Exchange or Refund, and Cash or credit, wait for a pick and move on by themselves; Details saves
        end={current === "details" ? <SaveBlock /> : current === "settle" || current === "money" ? null : <NextButton onClick={next} />}
      >
        {current === "cart" ? (
          <CartStage />
        ) : current === "settle" ? (
          <SettleCard />
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

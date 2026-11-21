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
import { AmountCard } from "./amount-card";
import { DetailsCard, SaveBlock } from "./details-card";
import { ItemsCard } from "./items-card";
import { RefundCard } from "./refund-card";
import { SettleCard } from "./settle-card";
import { type ExchangeHandoff, ReturnEntryProvider, type ReturnStep, useReturnEntry, useReturnEntryState } from "./state";
import type { SaleForReturn } from "~/providers/sale-return";

// /history/[id]/return (the admin's, from a sale's Return button): a sale return, laid out like the sale: one card at a
// time on the left with Back and Next, and a summary on the right (a bar above the card on a phone). 1 Items: the
// sale's cart, each with how many come back and where they go; 2 Amount; 3 Exchange or Refund; 4 Refund: where the
// money goes; 5 Details: the reason, remarks, day and Save. An exchange's Next opens the sale form for the same buyer,
// whose Save saves both
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
  const { t, sale, loading, loadFailed, retry, figures, total, chosen, mode, nameOf, packOf, payBack, places, complete, index, current, steps, reachable, summaryOpen, setSummaryOpen, show, next, tried, missingOf, leaveDialog, day, reasonKind, remarks } =
    useReturnEntry();
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
      step: "items",
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
    { key: "amount", step: "amount", heading: t("steps.amount"), value: complete.amount && index > 0 ? rupees(total) : null },
    { key: "settle", step: "settle", heading: t("steps.settle"), value: mode ? t(`modes.${mode}`) : null },
    ...(mode === "refund"
      ? [
          {
            key: "refund",
            step: "refund" as const,
            heading: t("steps.refund"),
            value:
              payBack === 0
                ? index > steps.indexOf("refund")
                  ? t("onAccount")
                  : null
                : places.filter((p) => p.amount > 0).map((p) => ({ name: `${p.name} ${p.sub ?? ""}`.trim(), amount: rupees(p.amount) })),
          },
        ]
      : []),
    {
      key: "details",
      step: "details",
      heading: t("steps.details"),
      value: current === "details" || reasonKind ? [dayInWords(day, locale), reasonKind ? t(`reasons.${reasonKind}`) : "", remarks.trim()].filter((v) => v !== "") : null,
    },
  ];
  const linesView = (
    <SummaryLines<ReturnStep>
      type={title}
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
        name={t(`steps.${current}`)}
        // Items names its own parts
        hideName={current === "items"}
        onBack={index > 0 ? () => show(steps[index - 1]!) : null}
        onChange={null}
        missing={tried && !complete[current] ? missingOf(current) : null}
        // Exchange or Refund waits for a pick and moves on by itself; Details saves
        end={current === "details" ? <SaveBlock /> : current === "settle" ? null : <NextButton onClick={next} />}
      >
        {current === "items" ? <ItemsCard /> : current === "amount" ? <AmountCard /> : current === "settle" ? <SettleCard /> : current === "refund" ? <RefundCard /> : <DetailsCard />}
      </StepCard>
    </EntryPage>
  );
}

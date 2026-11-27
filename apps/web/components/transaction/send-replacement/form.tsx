"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { dayInWords } from "~/components/ui/date-input";
import { rupees } from "~/lib/format";
import { usePendingSaleReplacement, useReturnSources } from "~/providers/sale-return";

import { ProductImage } from "../../product/products/product-tile";
import { EntryNote, EntryPage, NextButton, StepCard, type SummaryItem, SummaryBar, SummaryCard, SummaryLines } from "../shared/entry-frame";
import { CartStage } from "./cart-stage";
import { CustomerStage } from "./customer-stage";
import { DetailsCard, SaveBlock } from "./cards";
import { type SendInput, SendProvider, type SendStep, useSendEntry, useSendState } from "./state";

// /history/[id]/send-replacement, from Send replacement on a sale return's credit note (the admin's): the packs replaced
// later going out to the customer, as a purchase replacement: 1 Customer: the sale's, with Edit; 2 Cart: how many of each go and the godowns they leave
// from; 3 Details: vehicle, date, remarks and Save. A summary on the right (a bar above on a phone). Saved, it lands on
// the sale's success card
export function SendReplacementForm({ id }: { id: string }) {
  const [round, setRound] = useState(0);
  return <Loader key={round} id={id} onDiscard={() => setRound((r) => r + 1)} />;
}

// waits for what's still to go, the products and stock, then opens the stages
function Loader({ id, onDiscard }: { id: string; onDiscard: () => void }) {
  const t = useTranslations("transactions.saleReturn.send");
  const ts = useTranslations("transactions.sale");
  const read = usePendingSaleReplacement(id);
  const sources = useReturnSources();
  if (read.loading || sources.loading)
    return (
      <EntryNote title={t("title")} loading>
        {t("loading")}
      </EntryNote>
    );
  if (read.loadFailed || sources.loadFailed || !read.pending)
    return (
      <EntryNote
        title={t("title")}
        failed
        onRetry={() => {
          read.retry();
          sources.retry();
        }}
      >
        {ts("loadFailed")}
      </EntryNote>
    );
  // nothing left to go: said plainly
  if (read.pending.lines.length === 0) return <EntryNote title={t("title")}>{t("nothingLeft")}</EntryNote>;
  return <Entry pending={read.pending} ledger={read.ledger} products={sources.products} stock={sources.stock} onDiscard={onDiscard} />;
}

// the state, made once, for every stage
function Entry(props: SendInput) {
  const state = useSendState(props);
  return (
    <SendProvider value={state}>
      <View />
    </SendProvider>
  );
}

// the page: the stage on its own with Back and Next, and the summary
function View() {
  const { t, ts, tc, locale, pending, customerLedger, lines, nameOf, packOf, figureOf, total, vehicle, day, remarks, current, index, steps, reachable, summaryOpen, setSummaryOpen, show, next, tried, complete, missingOf, leaveDialog } =
    useSendEntry();
  const title = t("titleFor", { number: pending.assignedId });

  // the summary: the customer, each item going (photo, name, how many, its total), the vehicle, the date, the remarks
  const summary: SummaryItem<SendStep>[] = [
    { key: "customer", step: "customer", heading: t("customer"), value: customerLedger ? (customerLedger.party?.name ?? customerLedger.name) : pending.customerName },
    {
      key: "items",
      step: "cart",
      heading: t("steps.cart"),
      value: Object.entries(lines).map(([productId, l]) => {
        const found = packOf(productId);
        const q = Number(l.quantity) || 0;
        return {
          name: nameOf(productId),
          middle: `×${q.toLocaleString("en-IN")}`,
          amount: rupees(figureOf(productId, q).total / 100),
          image: found ? <ProductImage group={found.group} imageUrl={found.pack.imageUrl} className="size-8 rounded-md text-xs" /> : undefined,
        };
      }),
    },
    { key: "vehicle", step: "details", heading: ts("vehicle"), value: vehicle || null },
    { key: "date", step: "details", heading: tc("q.date"), value: index >= steps.indexOf("details") && day ? dayInWords(day, locale) : null },
    { key: "remarks", step: "details", heading: tc("q.remarks"), value: remarks.trim() || null },
  ];
  const linesView = (
    <SummaryLines<SendStep>
      type={t("type")}
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
      showBar
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
        onBack={index > 0 ? () => show(steps[index - 1]!) : null}
        onChange={null}
        missing={tried && !complete[current] ? missingOf(current) : null}
        end={current === "details" ? <SaveBlock /> : <NextButton onClick={next} />}
      >
        {current === "customer" ? <CustomerStage /> : current === "cart" ? <CartStage /> : <DetailsCard />}
      </StepCard>
    </EntryPage>
  );
}

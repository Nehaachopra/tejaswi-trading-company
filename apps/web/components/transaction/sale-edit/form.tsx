"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { rupees, titleCase } from "~/lib/format";
import { SaleDataProvider, useSaleData } from "~/providers/sale";
import { useSaleForEdit, useSaveSaleEdit } from "~/providers/sale-edit";

import { EntryNote, EntryPage, NextButton, StepCard, type SummaryItem, SummaryBar, SummaryCard, SummaryLines } from "../shared/entry-frame";
import { dateLine, productsLine, textLine } from "../shared/summary";
import { CartStage } from "./cart-stage";
import { CustomerStage } from "./customer-stage";
import { DetailsStage } from "./details-stage";
import { DueStage } from "./due-stage";
import { MoneyStage } from "./money-stage";
import { PaymentStage } from "./payment-stage";
import { type EditStep, SaleEditProvider, useSaleEdit, useSaleEditState } from "./state";

// /history/[id]/edit, from Edit sale on the sale's page (the admin's): the sale's own stages with only what can change:
// 1 Cart: each item's price (quantities, charges and discount as saved); 2 Payment: the breakup, and what's taken now
// or refunded (cash); 3 Details: the date and Save. The summary as a sale's. Saved over it and back to it in History;
// discarding starts it again from the saved sale
export function SaleEditForm({ id }: { id: string }) {
  const [round, setRound] = useState(0);
  return (
    <SaleDataProvider>
      <EditLoader key={round} id={id} onDiscard={() => setRound((r) => r + 1)} />
    </SaleDataProvider>
  );
}

// waits for the sale, its customer and the products (to name and price its items), then opens the stages
function EditLoader({ id, onDiscard }: { id: string; onDiscard: () => void }) {
  const t = useTranslations("transactions.sale");
  const data = useSaleData();
  const read = useSaleForEdit(id);
  const { saveEdit, saving, saved } = useSaveSaleEdit();
  const title = t("edit.title");

  if (data.loading || read.loading)
    return (
      <EntryNote title={title} loading>
        {t("loading")}
      </EntryNote>
    );
  if (data.loadFailed || read.loadFailed || !read.sale || !data.products)
    return (
      <EntryNote
        title={title}
        failed
        onRetry={() => {
          data.retryLoad();
          read.retry();
        }}
      >
        {t("loadFailed")}
      </EntryNote>
    );
  return (
    <EditEntry
      sale={read.sale}
      ledger={read.ledger}
      products={data.products}
      banks={data.banks ?? []}
      saveEdit={saveEdit}
      saving={saving}
      saved={saved}
      onDiscard={onDiscard}
    />
  );
}

// the state, made once, for every stage
function EditEntry(props: Parameters<typeof useSaleEditState>[0]) {
  const state = useSaleEditState(props);
  return (
    <SaleEditProvider value={state}>
      <EditView />
    </SaleEditProvider>
  );
}

// the page: the stage on its own with Back and Next, and the summary
function EditView() {
  const { t, tc, sale, lines, packOf, figures, total, editLeft, creditDue, kind, credit, customer, newParty, day, current, index, steps, reachable, summaryOpen, setSummaryOpen, show, next, back, tried, complete, missingOf, leaveDialog } =
    useSaleEdit();
  const locale = useLocale();
  const title = t("edit.title");

  // the summary, as a sale's: the items, the total, cash or credit, who bought it, what stays owed, the date
  const summary: SummaryItem<EditStep>[] = [
    productsLine<EditStep>("cart", t("steps.products"), lines.map((l) => ({ productId: l.productId, quantity: String(sale.lines.find((s) => s.productId === l.productId)?.quantity ?? 0) })), packOf, figures.map((f) => f.total)),
    { key: "amount", step: "cart", heading: t("steps.amount"), value: rupees(total) },
    textLine<EditStep>("money", "money", t("steps.money"), t(`kinds.${kind}`)),
    // the sale's customer or walk-in; a walk-in put on credit: the customer picked or added now
    textLine<EditStep>(
      "customer",
      steps.includes("customer") ? "customer" : "money",
      t("steps.customer"),
      titleCase(
        steps.includes("customer")
          ? customer?.kind === "ledger"
            ? customer.ledger.name
            : customer?.kind === "party"
              ? newParty.name
              : ""
          : (sale.customer?.name ?? sale.buyer?.name ?? ""),
      ) || null,
    ),
    textLine<EditStep>("left", "payment", t("leftDue"), current === "payment" || current === "details" ? rupees(credit ? creditDue : editLeft) : null),
    dateLine<EditStep>("date", "details", tc("sum.date"), day, locale, true),
  ];
  const linesView = (
    <SummaryLines<EditStep>
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
        // credit: the stage after the customer is its Due
        name={t(current === "cart" ? "steps.amount" : current === "payment" ? (credit ? "steps.due" : "steps.received") : `steps.${current}`)}
        onBack={index > 0 ? back : null}
        onChange={null}
        missing={tried && !complete[current] ? missingOf(current) : null}
        // Cash or credit moves on by itself; Details saves
        end={current === "details" ? <DetailsStage /> : current === "money" ? null : <NextButton onClick={next} />}
      >
        {current === "cart" ? (
          <CartStage />
        ) : current === "money" ? (
          <MoneyStage />
        ) : current === "customer" ? (
          <CustomerStage />
        ) : current === "payment" ? (
          credit ? <DueStage /> : <PaymentStage />
        ) : null}
      </StepCard>
    </EntryPage>
  );
}

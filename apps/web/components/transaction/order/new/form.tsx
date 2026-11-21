"use client";

import { useLocale } from "next-intl";
import { useState } from "react";

import { PurchaseOrderDataProvider } from "~/providers/purchase-order";

import { partyLabel } from "../../../account/party/party-kinds";
import { titleCase } from "~/lib/format";
import {
  EntryNote,
  EntryPage,
  NextButton,
  StepCard,
  type SummaryItem,
  SummaryBar,
  SummaryCard,
  SummaryLines,
} from "../../shared/entry-frame";
import { dateLine, productsLine } from "../../shared/summary";
import { DetailsCard, SaveBlock } from "./details-card";
import { ProductsStage } from "./products-stage";
import { type OrderEditSeed, type OrderStep, OrderEntryProvider, useOrderEntry, useOrderEntryState } from "./state";
import { CustomerStage } from "./customer-stage";
import { CartStage } from "./cart-stage";

// /transaction/purchase-order and /transaction/sale-order (from Home): a purchase or a sale order, laid out like a
// payment: one card at a time on the left with Back and Next, and a summary on the right (a bar above the card on a
// phone) that goes back to any card. 1 Products: the items on the order (price and quantity each) above every other pack
// size; 2 Amount; 3 Supplier (a sale's Customer); 4 Details: the order's date, when it's expected, remarks and Save. A
// save goes to the order's own page. Discarding to open a menu starts the form again
export function OrderForm({ kind, isAdmin }: { kind: "purchase" | "sale"; isAdmin: boolean }) {
  const [round, setRound] = useState(0);
  return (
    <PurchaseOrderDataProvider isAdmin={isAdmin}>
      <OrderEntry key={round} kind={kind} isAdmin={isAdmin} onDiscard={() => setRound((r) => r + 1)} />
    </PurchaseOrderDataProvider>
  );
}

// the form itself: a new order, or (with `edit`) one being changed
export function OrderEntry({
  kind,
  isAdmin,
  onDiscard,
  edit = null,
}: {
  kind: "purchase" | "sale";
  isAdmin: boolean;
  onDiscard: () => void;
  edit?: OrderEditSeed | null;
}) {
  const state = useOrderEntryState({ kind, isAdmin, onDiscard, edit });
  return (
    <OrderEntryProvider value={state}>
      <OrderEntryView />
    </OrderEntryProvider>
  );
}

// the page: what shows while it loads or can't, then the card on its own with the summary
function OrderEntryView() {
  const locale = useLocale();
  const {
    t,
    loading,
    loadFailed,
    retryLoad,
    kind,
    lines,
    packOf,
    supplier,
    supplierPick,
    newSupplier,
    newCustomer,
    sameNameDialog,
    orderDate,
    expected,
    total,
    tried,
    complete,
    steps,
    current,
    index,
    reachable,
    summaryOpen,
    setSummaryOpen,
    stepName,
    missingOf,
    leaveDialog,
    show,
    next,
    editing,
    figures,
  } = useOrderEntry();
  // an order being changed says so
  const title = editing ? t("edit.title") : t(kind === "sale" ? "titleSale" : "titlePurchase");

  if (loading)
    return (
      <EntryNote title={title} loading>
        {t("loading")}
      </EntryNote>
    );
  if (loadFailed)
    return (
      <EntryNote title={title} failed onRetry={retryLoad}>
        {t("loadFailed")}
      </EntryNote>
    );

  // a line for each card answered: each item (a small photo, its name, its quantity), the supplier, then the order's
  // date, the expected date and the remarks, each on its own
  const summary: SummaryItem<OrderStep>[] = [
    productsLine<OrderStep>("products", stepName("products"), lines, packOf, figures.map((f) => f?.total ?? 0)),
    // (an order being changed has no Supplier card)
    ...(editing ? [] : [{ key: "supplier", step: "supplier" as const, heading: stepName("supplier"), value: supplier ? (supplier.party ? partyLabel(supplier.party) : supplier.name) : supplierPick?.kind === "party" && (kind === "sale" ? newCustomer.name : newSupplier.name).trim() ? titleCase(kind === "sale" ? newCustomer.name : newSupplier.name) : null }]),
    // the dates only, each on its own line (no Details heading, no remarks): the order's date (once Details is reached
    // or the expected day is typed), and when it's expected
    dateLine<OrderStep>("orderDate", "details", t("orderDate"), orderDate, locale, current === "details" || !!expected),
    dateLine<OrderStep>("expected", "details", t("expected"), expected, locale, !!expected),
  ];
  const linesView = (
    <SummaryLines<OrderStep>
      type={t(kind === "sale" ? "typeSale" : "typePurchase")}
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
      {sameNameDialog}
      <StepCard
        key={current}
        id={current}
        name={stepName(current)}
        // Products names its own part further down, above the filters
        hideName={current === "products"}
        onBack={index > 0 ? () => show(steps[index - 1]!) : null}
        onChange={null}
        missing={tried && !complete[current] ? missingOf(current) : null}
        // the Products stage's Cart button moves on; the customer stage's Next shows once someone is picked (or someone new). Details
        // saves
        end={
          current === "details" ? (
            <SaveBlock />
          ) : current === "products" || (current === "supplier" && supplierPick === null) ? null : (
            <NextButton onClick={next} />
          )
        }
      >
        {current === "products" ? (
          <ProductsStage />
        ) : current === "totals" ? (
          <CartStage />
        ) : current === "supplier" ? (
          <CustomerStage />
        ) : (
          <DetailsCard />
        )}
      </StepCard>
    </EntryPage>
  );
}

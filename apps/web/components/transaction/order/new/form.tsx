"use client";

import { useLocale } from "next-intl";
import { useState } from "react";

import { dayInWords } from "~/components/ui/date-input";
import { PurchaseOrderDataProvider } from "~/providers/purchase-order";

import { partyLabel } from "../../../account/party/party-kinds";
import { packLabel, titleCase } from "~/lib/format";
import { ProductImage, productTitle } from "../../../product/products/product-tile";
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
import { DetailsCard, SaveBlock } from "./details-card";
import { ProductsCard } from "./products-card";
import { type OrderEditSeed, type OrderStep, OrderEntryProvider, useOrderEntry, useOrderEntryState } from "./state";
import { SupplierCard } from "./supplier-card";
import { TotalsCard } from "./totals-card";
import { TypeCard } from "./type-card";

// /transaction/order (from Home): a purchase or sale order, laid out like a payment: one card at a time on the left with Back
// and Next, and a summary on the right (a bar above the card on a phone) that goes back to any card. 1 Type: Purchase or
// Sale; 2 Products: the items on the order (price and quantity each) above every other pack size; 3 Amount; 4 Supplier
// (a sale's Customer);
// 5 Details: the order's date, when it's expected, remarks and Save. A save goes to the order's own page. Discarding
// to open a menu starts the form again
export function OrderForm({ isAdmin }: { isAdmin: boolean }) {
  const [round, setRound] = useState(0);
  return (
    <PurchaseOrderDataProvider isAdmin={isAdmin}>
      <OrderEntry key={round} isAdmin={isAdmin} onDiscard={() => setRound((r) => r + 1)} />
    </PurchaseOrderDataProvider>
  );
}

// the form itself: a new order, or (with `edit`) one being changed
export function OrderEntry({ isAdmin, onDiscard, edit = null }: { isAdmin: boolean; onDiscard: () => void; edit?: OrderEditSeed | null }) {
  const state = useOrderEntryState({ isAdmin, onDiscard, edit });
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
    remarks,
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
  } = useOrderEntry();
  // an order being changed says so
  const title = editing ? t("edit.title") : t("title");

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

  // a line for each card answered: the type, each item (a small photo, its name, its quantity), the supplier, then the
  // dates and remarks
  const summary: SummaryItem<OrderStep>[] = [
    // (an order being changed has no Type card)
    ...(editing ? [] : [{ key: "type", step: "type" as const, heading: stepName("type"), value: kind ? t(`kinds.${kind}`) : null }]),
    {
      key: "products",
      step: "products",
      heading: stepName("products"),
      value: lines.flatMap((l) => {
        const found = packOf(l.productId);
        if (!found) return [];
        return [
          {
            name: `${productTitle(found.group)} ${packLabel(found.pack.packSize, found.pack.packSizeCode)}`,
            amount: Number(l.quantity || 0).toLocaleString("en-IN"),
            image: <ProductImage group={found.group} imageUrl={found.pack.imageUrl} className="size-8 rounded-md text-xs" />,
          },
        ];
      }),
    },
    // (nor a Supplier card)
    ...(editing ? [] : [{ key: "supplier", step: "supplier" as const, heading: stepName("supplier"), value: supplier ? (supplier.party ? partyLabel(supplier.party) : supplier.name) : supplierPick?.kind === "party" && (kind === "sale" ? newCustomer.name : newSupplier.name).trim() ? titleCase(kind === "sale" ? newCustomer.name : newSupplier.name) : null }]),
    {
      key: "details",
      step: "details",
      heading: stepName("details"),
      value: current === "details" || expected || remarks.trim()
        ? [dayInWords(orderDate, locale), expected ? `${t("expected")}: ${dayInWords(expected, locale)}` : "", remarks.trim()].filter((v) => v !== "")
        : null,
    },
  ];
  const linesView = (
    <SummaryLines<OrderStep>
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
      showBar={kind !== null}
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
        // Type and Supplier move on by themselves once picked; back on Supplier with one picked (or someone new), Next
        // goes on. Details saves
        end={
          current === "details" ? (
            <SaveBlock />
          ) : current === "type" || (current === "supplier" && supplierPick === null) ? null : (
            <NextButton onClick={next} />
          )
        }
      >
        {current === "type" ? (
          <TypeCard />
        ) : current === "products" ? (
          <ProductsCard />
        ) : current === "totals" ? (
          <TotalsCard />
        ) : current === "supplier" ? (
          <SupplierCard />
        ) : (
          <DetailsCard />
        )}
      </StepCard>
    </EntryPage>
  );
}

"use client";

import { useLocale } from "next-intl";
import { useState } from "react";

import { dayInWords } from "~/components/ui/date-input";

import { packLabel, rupees, titleCase } from "~/lib/format";
import { SaleDataProvider } from "~/providers/sale";

import { partyLabel } from "../../account/party/party-kinds";
import { ProductImage, productTitle } from "../../product/products/product-tile";
import { EntryNote, EntryPage, NextButton, StepCard, type SummaryItem, SummaryBar, SummaryCard, SummaryLines } from "../shared/entry-frame";
import { AmountCard } from "./amount-card";
import { CustomerCard } from "./customer-card";
import { DetailsCard, SaveBlock } from "./details-card";
import { MoneyCard } from "./money-card";
import { ProductsCard } from "./products-card";
import { type SaleStep, SaleEntryProvider, useSaleEntry, useSaleEntryState } from "./state";

// /transaction/sale (from the transaction hub): a sale, laid out like a payment: one card at a time on the left with
// Back and Next, and a summary on the right (a bar above the card on a phone) that goes back to any card. 1 Products:
// the cart above every pack size that can be sold; 2 Amount: the charges and a cash discount; 3 Cash or credit (and
// where the cash came into); 4 Customer; 5 Details: the day, remarks and Save. A save goes to the sale's success page. Discarding to open a menu
// starts the form again
export function SaleForm({ isAdmin }: { isAdmin: boolean }) {
  const [round, setRound] = useState(0);
  return (
    <SaleDataProvider>
      <SaleEntry key={round} isAdmin={isAdmin} onDiscard={() => setRound((r) => r + 1)} />
    </SaleDataProvider>
  );
}

function SaleEntry({ isAdmin, onDiscard }: { isAdmin: boolean; onDiscard: () => void }) {
  const state = useSaleEntryState({ isAdmin, onDiscard });
  return (
    <SaleEntryProvider value={state}>
      <SaleEntryView />
    </SaleEntryProvider>
  );
}

// the page: what shows while it loads or can't, then the card on its own with the summary
function SaleEntryView() {
  const {
    t,
    tc,
    loading,
    loadFailed,
    retryLoad,
    lines,
    packOf,
    total,
    kind,
    gridPlaces,
    customer,
    newParty,
    buyerName,
    day,
    remarks,
    tried,
    complete,
    steps,
    current,
    index,
    reachable,
    summaryOpen,
    setSummaryOpen,
    missingOf,
    leaveDialog,
    sameNameDialog,
    show,
    next,
  } = useSaleEntry();
  const locale = useLocale();

  if (loading)
    return (
      <EntryNote title={t("title")} loading>
        {t("loading")}
      </EntryNote>
    );
  if (loadFailed)
    return (
      <EntryNote title={t("title")} failed onRetry={retryLoad}>
        {t("loadFailed")}
      </EntryNote>
    );

  // a line for each card answered: each item (a small photo, its name, its quantity), the total, cash (with where it
  // came into) or credit, then who bought it
  const into = gridPlaces.filter((p) => p.amount > 0);
  const summary: SummaryItem<SaleStep>[] = [
    {
      key: "products",
      step: "products",
      heading: t("steps.products"),
      value: lines.flatMap((l) => {
        const found = packOf(l.productId);
        if (!found) return [];
        return [
          {
            name: `${productTitle(found.group)} ${packLabel(found.pack.packSize, found.pack.packSizeCode)}`,
            amount: (Number(l.quantity) || 0).toLocaleString("en-IN"),
            image: <ProductImage group={found.group} imageUrl={found.pack.imageUrl} className="size-8 rounded-md text-xs" />,
          },
        ];
      }),
    },
    { key: "amount", step: "amount", heading: t("steps.amount"), value: complete.amount && index > 0 ? rupees(total) : null },
    {
      key: "money",
      step: "money",
      heading: t("steps.money"),
      value:
        kind === "credit"
          ? t("kinds.credit")
          : kind === "cash"
            ? into.length === 0
              ? t("kinds.cash")
              : into.map((p) => ({ name: p.id === "cash" ? tc("cash") : `${p.name} ${p.sub ?? ""}`.trim(), amount: rupees(p.amount) }))
            : null,
    },
    {
      key: "customer",
      step: "customer",
      heading: t("steps.customer"),
      value:
        customer?.kind === "ledger"
          ? customer.ledger.party
            ? partyLabel(customer.ledger.party)
            : customer.ledger.name
          : customer?.kind === "party" && newParty.name.trim()
            ? titleCase(newParty.name)
            : kind === "cash" && buyerName.trim()
              ? titleCase(buyerName)
              : null,
    },
    {
      key: "details",
      step: "details",
      heading: t("steps.details"),
      value: current === "details" || remarks.trim() ? [dayInWords(day, locale), remarks.trim()].filter((v) => v !== "") : null,
    },
  ];
  const linesView = (
    <SummaryLines<SaleStep>
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
      title={t("title")}
      summaryLabel={t("summary")}
      showBar={lines.length > 0}
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
        name={t(`steps.${current}`)}
        // Products names its own parts further down
        hideName={current === "products"}
        onBack={index > 0 ? () => show(steps[index - 1]!) : null}
        onChange={null}
        missing={tried && !complete[current] ? missingOf(current) : null}
        // Cash or credit waits for a pick (Credit moves on by itself); Details saves
        end={current === "details" ? <SaveBlock /> : current === "money" && kind !== "cash" ? null : <NextButton onClick={next} />}
      >
        {current === "products" ? <ProductsCard /> : current === "amount" ? <AmountCard /> : current === "money" ? <MoneyCard /> : current === "customer" ? <CustomerCard /> : <DetailsCard />}
      </StepCard>
    </EntryPage>
  );
}

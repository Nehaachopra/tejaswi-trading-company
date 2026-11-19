"use client";

import { useLocale } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { dayInWords } from "~/components/ui/date-input";
import { packLabel, rupees, titleCase } from "~/lib/format";
import { PurchaseDataProvider } from "~/providers/purchase";

import { partyLabel } from "../../account/party/party-kinds";
import { ProductImage, productTitle } from "../../product/products/product-tile";
import { EntryNote, EntryPage, NextButton, StepCard, type SummaryItem, SummaryBar, SummaryCard, SummaryLines } from "../shared/entry-frame";
import { AmountCard } from "./amount-card";
import { BillCard } from "./bill-card";
import { DetailsCard, SaveBlock } from "./details-card";
import { MoneyCard } from "./money-card";
import { PaidCard } from "./paid-card";
import { ProductsCard } from "./products-card";
import { type PurchaseStep, PurchaseEntryProvider, usePurchaseEntry, usePurchaseEntryState } from "./state";
import { SupplierCard } from "./supplier-card";

// /transaction/purchase (from the transaction hub): a purchase, laid out like the sale: one card at a time on the left
// with Back and Next, and a summary on the right (a bar above the card on a phone) that goes back to any card. 1
// Products; 2 Amount: the charges and a cash discount; 3 Cash or credit; 4 Supplier; 5 Paid (cash) or Due (credit); 6
// Bill: its number, date and photo; 7 Details: vehicle, remarks and Save. A save goes to the purchase's success page.
// Discarding to open a menu starts the form again. `orderId` (Record arrival): an arrival on that purchase order
export function PurchaseForm({ isAdmin, orderId = null }: { isAdmin: boolean; orderId?: string | null }) {
  const [round, setRound] = useState(0);
  return (
    <PurchaseDataProvider orderId={orderId}>
      <PurchaseEntry key={round} isAdmin={isAdmin} onDiscard={() => setRound((r) => r + 1)} />
    </PurchaseDataProvider>
  );
}

function PurchaseEntry({ isAdmin, onDiscard }: { isAdmin: boolean; onDiscard: () => void }) {
  const state = usePurchaseEntryState({ isAdmin, onDiscard });
  return (
    <PurchaseEntryProvider value={state}>
      <PurchaseEntryView />
    </PurchaseEntryProvider>
  );
}

// the page: what shows while it loads or can't, then the card on its own with the summary
function PurchaseEntryView() {
  const {
    t,
    ts,
    tc,
    loading,
    loadFailed,
    retryLoad,
    lines,
    packOf,
    total,
    kind,
    tpf,
    advance,
    askingAdvance,
    supplier,
    setSupplier,
    newSupplier,
    places,
    creditDays,
    billNumber,
    billDay,
    vehicle,
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
  } = usePurchaseEntry();
  const locale = useLocale();

  if (loading)
    return (
      <EntryNote title={t("title")} loading>
        {ts("loading")}
      </EntryNote>
    );
  if (loadFailed)
    return (
      <EntryNote title={t("title")} failed onRetry={retryLoad}>
        {ts("loadFailed")}
      </EntryNote>
    );

  // a line for each card answered: each item, the total, cash or credit, who it's from, where it was paid from (or the
  // credit period), the bill, then the vehicle and remarks
  const from = places.filter((p) => p.amount > 0);
  const summary: SummaryItem<PurchaseStep>[] = [
    {
      key: "products",
      step: "products",
      heading: ts("steps.products"),
      value: lines.flatMap((l) => {
        const found = packOf(l.productId);
        if (!found) return [];
        return [
          {
            name: `${productTitle(found.group)} ${packLabel(found.pack.packSize, found.pack.packSizeCode, found.pack.packCount)}`,
            amount: (Number(l.quantity) || 0).toLocaleString("en-IN"),
            image: <ProductImage group={found.group} imageUrl={found.pack.imageUrl} className="size-8 rounded-md text-xs" />,
          },
        ];
      }),
    },
    { key: "amount", step: "amount", heading: ts("steps.amount"), value: complete.amount && index > 0 ? rupees(total) : null },
    { key: "money", step: "money", heading: ts("steps.money"), value: kind ? ts(`kinds.${kind}`) : null },
    {
      key: "supplier",
      step: "supplier",
      heading: t("steps.supplier"),
      value:
        supplier?.kind === "ledger"
          ? supplier.ledger.party
            ? partyLabel(supplier.ledger.party)
            : supplier.ledger.name
          : supplier?.kind === "party" && newSupplier.name.trim()
            ? titleCase(newSupplier.name)
            : null,
    },
    {
      key: "paid",
      step: "paid",
      heading: t(kind === "credit" ? "steps.due" : "steps.paid"),
      value:
        kind === "credit"
          ? creditDays
            ? `${creditDays} ${t("days")}`
            : null
          : from.length === 0
            ? null
            : from.map((p) => ({ name: p.id === "cash" ? tc("cash") : `${p.name} ${p.sub ?? ""}`.trim(), amount: rupees(p.amount) })),
    },
    { key: "bill", step: "bill", heading: t("steps.bill"), value: billNumber ? [billNumber, billDay ? dayInWords(billDay, locale) : ""].filter((v) => v !== "") : null },
    { key: "details", step: "details", heading: ts("steps.details"), value: remarks.trim() || vehicle ? [vehicle, remarks.trim()].filter((v) => v !== "") : null },
  ];
  const linesView = (
    <SummaryLines<PurchaseStep>
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
      summaryLabel={ts("summary")}
      showBar={lines.length > 0}
      bar={
        <SummaryBar label={ts("summary")} total={total} open={summaryOpen} onToggle={() => setSummaryOpen((o) => !o)}>
          {linesView}
        </SummaryBar>
      }
      summary={
        <SummaryCard label={ts("summary")} total={total}>
          {linesView}
        </SummaryCard>
      }
    >
      {leaveDialog}
      {sameNameDialog}
      {/* an advance in what's paid: asked before going on */}
      <ConfirmDialog
        open={askingAdvance !== null}
        tone="plain"
        title={tpf("advanceAsk.title")}
        body={tpf("advanceAsk.body", { amount: rupees(advance) })}
        confirmLabel={tpf("advanceAsk.yes")}
        cancelLabel={tpf("advanceAsk.no")}
        busy={false}
        onConfirm={() => askingAdvance?.(true)}
        onCancel={() => askingAdvance?.(false)}
      />
      <StepCard
        key={current}
        id={current}
        // a credit purchase's card after the supplier is its Due
        name={current === "paid" && kind === "credit" ? t("steps.due") : current === "supplier" || current === "paid" || current === "bill" ? t(`steps.${current}`) : ts(`steps.${current}`)}
        // Products names its own parts further down
        hideName={current === "products"}
        onBack={index > 0 ? () => show(steps[index - 1]!) : null}
        // someone new being typed in: Change goes back to the search
        onChange={current === "supplier" && supplier?.kind === "party" ? () => setSupplier(null) : null}
        missing={tried && !complete[current] ? missingOf(current) : null}
        // Cash or credit waits for a pick and moves on by itself; Details saves
        end={current === "details" ? <SaveBlock /> : current === "money" ? null : <NextButton onClick={() => void next()} />}
      >
        {current === "products" ? (
          <ProductsCard />
        ) : current === "amount" ? (
          <AmountCard />
        ) : current === "money" ? (
          <MoneyCard />
        ) : current === "supplier" ? (
          <SupplierCard />
        ) : current === "paid" ? (
          <PaidCard />
        ) : current === "bill" ? (
          <BillCard />
        ) : (
          <DetailsCard />
        )}
      </StepCard>
    </EntryPage>
  );
}

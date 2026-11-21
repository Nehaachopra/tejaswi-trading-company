"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { dayInWords } from "~/components/ui/date-input";

import { packLabel, rupees, titleCase } from "~/lib/format";
import { SaleDataProvider } from "~/providers/sale";

import type { ExchangeHandoff } from "../sale-return/state";

import { partyLabel } from "../../account/party/party-kinds";
import { ProductImage, productTitle } from "../../product/products/product-tile";
import { EntryNote, EntryPage, NextButton, StepCard, type SummaryItem, SummaryBar, SummaryCard, SummaryLines } from "../shared/entry-frame";
import { CartStage } from "./cart-stage";
import { CustomerStage } from "./customer-stage";
import { DetailsCard, SaveBlock } from "./details-card";
import { MoneyCard } from "./money-card";
import { ProductsStage } from "./products-stage";
import { ReceivedCard } from "./received-card";
import { type SaleEdit, type SaleStep, SaleEntryProvider, useSaleEntry, useSaleEntryState } from "./state";

// /transaction/sale (from the transaction hub): a sale, laid out like a payment: one card at a time on the left with
// Back and Next, and a summary on the right (a bar above the card on a phone) that goes back to any card. 1 Products:
// the cart above every pack size that can be sold; 2 Amount: the charges and a cash discount; 3 Cash or credit; 4
// Customer; 5 Received (cash only): what came in and where; 6 Details: the day, vehicle, remarks and Save. A save goes to the sale's success page. Discarding to open a menu
// starts the form again. (Editing a saved sale is edit/form.tsx, which opens SaleEntry with the sale.) With `exchange` it's an exchange's new sale (from a sale return): to the same buyer, the return
// counted as received, and its Save saves both; Back on its first card goes back to the return
export function SaleForm({
  isAdmin,
  orderId = null,
  exchange = null,
  onExchangeBack,
}: {
  isAdmin: boolean;
  orderId?: string | null;
  exchange?: ExchangeHandoff | null;
  onExchangeBack?: () => void;
}) {
  const [round, setRound] = useState(0);
  return (
    <SaleDataProvider orderId={orderId} exchangePartyId={exchange?.customer?.partyId ?? null}>
      <SaleEntry key={round} isAdmin={isAdmin} exchange={exchange} onExchangeBack={onExchangeBack} onDiscard={() => setRound((r) => r + 1)} />
    </SaleDataProvider>
  );
}

// the form itself, inside SaleDataProvider: a new sale, an exchange's, or (with `edit`, from the edit form) a saved one
export function SaleEntry({
  isAdmin,
  exchange = null,
  edit = null,
  onExchangeBack,
  onDiscard,
}: {
  isAdmin: boolean;
  exchange?: ExchangeHandoff | null;
  edit?: SaleEdit | null;
  onExchangeBack?: () => void;
  onDiscard: () => void;
}) {
  const state = useSaleEntryState({ isAdmin, exchange, edit, onDiscard });
  return (
    <SaleEntryProvider value={state}>
      <SaleEntryView onExchangeBack={onExchangeBack} />
    </SaleEntryProvider>
  );
}

// the page: what shows while it loads or can't, then the card on its own with the summary
function SaleEntryView({ onExchangeBack }: { onExchangeBack?: () => void }) {
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
    advance,
    askingAdvance,
    oldDue,
    dueNow,
    gridPlaces,
    customer,
    tdsCan,
    received,
    panNeeded,
    newParty,
    buyerName,
    buyerNeeded,
    day,
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
    figures,
    isEdit,
    exchange,
  } = useSaleEntry();
  // an edit's page is named for it, and an exchange's for the sale it's against
  const title = isEdit ? t("edit.title") : exchange ? t("exchange.title", { number: exchange.saleAssignedId }) : t("title");
  const locale = useLocale();
  const tr = useTranslations("transactions.receipt.form");

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

  // a line for each card answered: each item (a small photo, its name, its quantity), the total, cash (with where it
  // came into) or credit, then who bought it
  const into = gridPlaces.filter((p) => p.amount > 0);
  const summary: SummaryItem<SaleStep>[] = [
    {
      key: "products",
      step: "products",
      heading: t("steps.products"),
      // each item: its name with ×quantity beside it (muted), its total (price × quantity, with GST) at the end
      value: lines.flatMap((l, i) => {
        const found = packOf(l.productId);
        if (!found) return [];
        return [
          {
            name: `${productTitle(found.group)} ${packLabel(found.pack.packSize, found.pack.packSizeCode, found.pack.packCount)}`,
            middle: `×${(Number(l.quantity) || 0).toLocaleString("en-IN")}`,
            amount: rupees((figures[i]?.total ?? 0) / 100),
            image: <ProductImage group={found.group} imageUrl={found.pack.imageUrl} className="size-8 rounded-md text-xs" />,
          },
        ];
      }),
    },
    { key: "amount", step: "amount", heading: t("steps.amount"), value: complete.amount && index > 0 ? rupees(total) : null },
    // an exchange: the return, counted as received
    ...(exchange ? [{ key: "exchange", step: "amount" as const, heading: t("exchange.return"), value: `− ${rupees(exchange.total)}` }] : []),
    { key: "money", step: "money", heading: t("steps.money"), value: kind ? t(`kinds.${kind}`) : null },
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
            : buyerNeeded && buyerName.trim()
              ? titleCase(buyerName)
              : null,
    },
    // credit, to someone who owes from before: what they'll owe; cash: where it came into, a line each
    ...(kind === "credit"
      ? oldDue > 0
        ? [{ key: "received", step: "received" as const, heading: t("steps.due"), value: current === "received" || current === "details" ? rupees(dueNow) : null }]
        : []
      : [
          {
            key: "received",
            step: "received" as const,
            heading: t("steps.received"),
            value: into.length === 0 ? null : into.map((p) => ({ name: p.id === "cash" ? tc("cash") : `${p.name} ${p.sub ?? ""}`.trim(), amount: rupees(p.amount) })),
          },
        ]),
    {
      key: "details",
      step: "details",
      heading: t("steps.details"),
      value: current === "details" || remarks.trim() || vehicle ? [dayInWords(day, locale), vehicle, remarks.trim()].filter((v) => v !== "") : null,
    },
  ];
  const linesView = (
    <SummaryLines<SaleStep>
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
      {/* an advance in the amount: asked before going on */}
      <ConfirmDialog
        open={askingAdvance !== null}
        tone="plain"
        title={tr("advanceAsk.title")}
        body={tr("advanceAsk.body", { amount: rupees(advance) })}
        confirmLabel={tr("advanceAsk.yes")}
        cancelLabel={tr("advanceAsk.no")}
        busy={false}
        onConfirm={() => askingAdvance?.(true)}
        onCancel={() => askingAdvance?.(false)}
      />
      <StepCard
        key={current}
        id={current}
        // a credit sale's card after the customer is its Due
        name={t(current === "received" && kind === "credit" ? "steps.due" : `steps.${current}`)}
        // Products names its own parts further down; so does Received while it asks a PAN (PAN, then Received)
        hideName={current === "products" || (current === "received" && tdsCan && received > 0 && panNeeded)}
        // (an exchange's first card goes back to its return)
        onBack={index > 0 ? () => show(steps[index - 1]!) : (onExchangeBack ?? null)}
        // someone new being typed in: Change goes back to the search (as a receipt's); not for an order's buyer, who
        // stays the order's
        // (the customer stage has its own Change, beside Edit)
        onChange={null}
        missing={tried && !complete[current] ? missingOf(current) : null}
        // Cash or credit waits for a pick and moves on by itself; the Products card's Items | Total row moves on; Details
        // saves
        end={current === "details" ? <SaveBlock /> : current === "money" || current === "products" ? null : <NextButton onClick={() => void next()} />}
      >
        {current === "products" ? (
          <ProductsStage />
        ) : current === "amount" ? (
          <CartStage />
        ) : current === "money" ? (
          <MoneyCard />
        ) : current === "customer" ? (
          <CustomerStage />
        ) : current === "received" ? (
          <ReceivedCard />
        ) : (
          <DetailsCard />
        )}
      </StepCard>
    </EntryPage>
  );
}

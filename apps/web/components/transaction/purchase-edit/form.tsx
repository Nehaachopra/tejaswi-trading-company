"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { dayInWords } from "~/components/ui/date-input";
import { rupees } from "~/lib/format";
import { usePurchaseForEdit, useSavePurchaseEdit } from "~/providers/purchase-edit";
import { useReturnSources } from "~/providers/sale-return";

import { EntryNote, EntryPage, NextButton, StepCard, type SummaryItem, SummaryBar, SummaryCard, SummaryLines } from "../shared/entry-frame";
import { productsLine, textLine } from "../shared/summary";
import { BillCard } from "./bill-card";
import { CartStage } from "./cart-stage";
import { DetailsCard, SaveBlock } from "./details-card";
import { MoneyStage } from "./money-stage";
import { PaymentStage } from "./payment-stage";
import { type EditStep, PurchaseEditProvider, usePurchaseEdit, usePurchaseEditState } from "./state";

// /history/[id]/edit for a purchase, from Edit purchase on its page (the admin's), as an edited sale: 1 Cart: each
// item's cost (quantities, discounts and charges as saved); 2 Cash or credit and the payment, only when money moves (the
// bill went up, or below what was paid); 3 Bill: its number and date; 4 Details: vehicle, remarks and Save. Saved over
// it and back to it in History; discarding starts it again from the saved purchase
export function PurchaseEditForm({ id }: { id: string }) {
  const [round, setRound] = useState(0);
  return <EditLoader key={round} id={id} onDiscard={() => setRound((r) => r + 1)} />;
}

// waits for the purchase, the products (to name and picture its items) and cash and the banks, then opens the stages
function EditLoader({ id, onDiscard }: { id: string; onDiscard: () => void }) {
  const te = useTranslations("transactions.purchase.edit");
  const ts = useTranslations("transactions.sale");
  const sources = useReturnSources();
  const read = usePurchaseForEdit(id);
  const { saveEdit, saving, saved } = useSavePurchaseEdit();
  const title = te("title");

  if (sources.loading || read.loading)
    return (
      <EntryNote title={title} loading>
        {ts("loading")}
      </EntryNote>
    );
  if (sources.loadFailed || read.loadFailed || !read.purchase)
    return (
      <EntryNote
        title={title}
        failed
        onRetry={() => {
          sources.retry();
          read.retry();
        }}
      >
        {ts("loadFailed")}
      </EntryNote>
    );
  return <EditEntry purchase={read.purchase} products={sources.products} money={sources.money} saveEdit={saveEdit} saving={saving} saved={saved} onDiscard={onDiscard} />;
}

// the state, made once, for every stage
function EditEntry(props: Parameters<typeof usePurchaseEditState>[0]) {
  const state = usePurchaseEditState(props);
  return (
    <PurchaseEditProvider value={state}>
      <EditView />
    </PurchaseEditProvider>
  );
}

// the page: the stage on its own with Back and Next, and the summary
function EditView() {
  const { t, te, ts, tc, locale, purchase, lines, packOf, figures, total, kind, credit, moving, takingBack, owedAfter, billNumber, billDay, vehicle, remarks, current, index, steps, reachable, summaryOpen, setSummaryOpen, show, next, tried, complete, missingOf, leaveDialog } =
    usePurchaseEdit();
  const title = te("title");

  // the summary, as a purchase's: the items, the total, cash or credit and what moves (or what we'll owe), the bill,
  // then the vehicle and remarks
  const summary: SummaryItem<EditStep>[] = [
    productsLine<EditStep>("cart", ts("steps.products"), lines.map((l) => ({ productId: l.productId, quantity: String(purchase.lines.find((s) => s.productId === l.productId)?.quantity ?? 0) })), packOf, figures.map((f) => f.total)),
    { key: "amount", step: "cart", heading: ts("steps.amount"), value: rupees(total) },
    ...(steps.includes("money")
      ? [
          textLine<EditStep>("money", "money", ts("steps.money"), kind ? ts(`kinds.${kind}`) : null),
          textLine<EditStep>(
            "payment",
            "payment",
            credit ? ts("leftDue") : takingBack ? te("toReceive") : te("toPay"),
            kind === null || index < steps.indexOf("payment") ? null : rupees(credit ? owedAfter : moving),
          ),
        ]
      : []),
    textLine<EditStep>("bill", "bill", t("billNumber"), billNumber || null),
    { key: "billDate", step: "bill", heading: t("billDate"), value: billDay ? dayInWords(billDay, locale) : null },
    textLine<EditStep>("vehicle", "details", ts("vehicle"), vehicle || null),
    textLine<EditStep>("remarks", "details", tc("q.remarks"), remarks.trim() || null),
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
      summaryLabel={ts("summary")}
      showBar
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
      <StepCard
        key={current}
        id={current}
        name={
          current === "cart"
            ? ts("steps.amount")
            : current === "money"
              ? ts("steps.money")
              : current === "payment"
                ? ts(credit ? "steps.due" : "steps.received")
                : current === "bill"
                  ? t("steps.bill")
                  : ts("steps.details")
        }
        onBack={index > 0 ? () => show(steps[index - 1]!) : null}
        onChange={null}
        missing={tried && !complete[current] ? missingOf(current) : null}
        // Cash or credit moves on by itself; Details saves
        end={current === "details" ? <SaveBlock /> : current === "money" ? null : <NextButton onClick={next} />}
      >
        {current === "cart" ? (
          <CartStage />
        ) : current === "money" ? (
          <MoneyStage />
        ) : current === "payment" ? (
          <PaymentStage />
        ) : current === "bill" ? (
          <BillCard />
        ) : (
          <DetailsCard />
        )}
      </StepCard>
    </EntryPage>
  );
}

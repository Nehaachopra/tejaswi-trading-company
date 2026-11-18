"use client";

import { IndianRupee } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { fieldClass } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { MicField } from "~/components/ui/mic-button";
import { Note } from "~/components/ui/note";
import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { Reveal } from "~/components/ui/reveal";
import { Switch } from "~/components/ui/switch";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { AccountCards } from "../shared/account-cards/account-cards";
import { type AccountCardsApi } from "../shared/account-cards/types";
import { type AmountRow, PlainRows } from "../shared/amount-table";
import { DueFlow, FoldGroup } from "../shared/fold-group";
import { input, saidAmount } from "../shared/form-basics";
import { SALE_TDS_RATE, useSaleEntry } from "./state";

// a row: its name on the left (level with the box's first line), its figure or box on the right, as a receipt's
const underValue = "ml-auto w-[60%]";
function Row({ label, htmlFor, children }: { label: React.ReactNode; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <label htmlFor={htmlFor} className="flex min-h-11 min-w-0 items-center text-sm">
        {label}
      </label>
      <div className="w-[60%] shrink-0 [&_input]:text-right">{children}</div>
    </div>
  );
}

// a part's heading inside the card (PAN, then Received), as the card's own name reads
const partHeading = "text-xs font-semibold uppercase tracking-[0.08em] opacity-60";

// a figure that isn't typed: its name on the left, the figure on the right
function Figure({ label, amount, strong = false }: { label: string; amount: number; strong?: boolean }) {
  return (
    <div className={cn("tabular flex items-baseline justify-between gap-3 text-sm", strong && "border-t border-chestnut/30 pt-2")}>
      <span className="min-w-0">{label}</span>
      <span className={cn("shrink-0 whitespace-nowrap text-base font-semibold", strong && "font-bold")}>{rupees(amount)}</span>
    </div>
  );
}

// the Received card (a cash sale's, after the customer), laid out as a payment's Amount card. On top the supporting
// details: the old due (if they owe from before) and this bill; with an advance they already have with us, Set off
// from advance (a switch, taking as much as the bill needs); then the due left to pay. Then one breakup: the amount received in its box (a saved customer's is typed: any part of what's due, the
// rest staying owed, or more, the rest an advance; a walk-in's is the bill), the TDS they deducted (a switch; the PAN
// is asked once TDS is on and none is saved), then the total of the two. Beside it on a wider screen, with an old due: what it goes towards, the old
// due first. Then the account cards, the card's full width. A credit sale to someone who owes from before shows only
// the three due rows
export function ReceivedCard() {
  const e = useSaleEntry();
  const { t, tc, kind, tried, total, oldDue, dueNow, received, tdsCan, tdsOnIt, panNeeded } = e;
  const tr = useTranslations("transactions.receipt.form");
  const tdsLabel = useId();
  const setOffLabel = useId();
  const cards = useSaleCards();
  const [towardsOpen, setTowardsOpen] = useState(false);
  const filled = received > 0;
  const amountBad = tried && received === 0 && e.setOff === 0;
  const panBad = tried && panNeeded && !/^[A-Z]{5}\d{4}[A-Z]$/.test(e.pan);
  // their PAN is asked: TDS on, an amount in, none saved
  const askPan = tdsCan && filled && panNeeded;
  // the amount's box: large and bold; chestnut, no shadow, once filled
  const amountBox = "min-h-12 pl-11 font-heading text-xl font-bold tabular";
  const rupeeMark = (on: boolean) => (
    <IndianRupee className={cn("pointer-events-none absolute left-3.5 top-1/2 z-10 size-5 -translate-y-1/2", on && "text-ivory")} aria-hidden />
  );

  // the advance still with us after this sale: what wasn't set off against the bill, and what's paid over what's due
  const pendingAdvance = Math.round((e.heldAdvance - e.setOff + e.advance) * 100) / 100;
  // the breakup's rows: what came in, the TDS they deducted, then what's left once they're counted: the due they still
  // owe, or (nothing owed) the advance still with us
  const advanceLeft = e.leftDue === 0 && pendingAdvance > 0;
  const rows: AmountRow[] = [
    { key: "in", label: tc("sum.amount"), amount: received },
    {
      key: "tds",
      label: (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span id={tdsLabel}>{tc("sum.tds")}</span>
          <Switch small on={tdsOnIt} onFlip={e.flipTds} labelledBy={tdsLabel} />
          {tdsOnIt && <span className="tabular text-xs font-semibold">{SALE_TDS_RATE}%</span>}
        </span>
      ),
      amount: e.tdsAmount,
    },
    {
      key: "left",
      label: advanceLeft ? t("advanceLeft") : t("leftDue"),
      amount: advanceLeft ? pendingAdvance : e.leftDue,
      tone: "total" as const,
    },
  ];

  const towards = (
    <FoldGroup title={tr("towardsGroup")} figure={e.settles} open={towardsOpen} onOpen={setTowardsOpen}>
      {/* two flows: what goes towards the old due, then towards this bill */}
      <DueFlow
        wholeLabel={tr("receiptGroup")}
        whole={e.settles}
        dueLabel={t("oldDue")}
        due={e.towardsOld}
        advanceLabel={t("thisBill")}
        advance={e.towardsBill}
        paidLabel=""
        owedBefore={0}
      />
    </FoldGroup>
  );
  // a saved customer's: shown for every amount received, whatever they owed or had with us before
  const hasTowards = tdsCan && filled;

  // a credit sale: only what they'll owe, nothing to type
  if (kind === "credit")
    return (
      <div className="flex flex-col gap-2 sm:max-w-80">
        <Figure label={t("thisBill")} amount={total} />
        <Figure label={t("oldDue")} amount={oldDue} />
        <Figure label={tr("due")} amount={dueNow} strong />
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      {/* their PAN (TDS on, an amount in, none saved): under its own heading above the Received heading (the card's own
          name is hidden then) */}
      {askPan && (
        <>
          <section className="flex min-w-0 flex-col gap-2.5 sm:max-w-[calc(50%-1.5rem)]">
            <h3 className={partHeading}>PAN</h3>
            <Row
              htmlFor="pan-field"
              label={
                <>
                  {t("pan")}
                  <RequiredMark />
                </>
              }
            >
              <input
                id="pan-field"
                value={e.pan}
                maxLength={10}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                placeholder="ABCDE1234F"
                onChange={(ev) => e.setPan(ev.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
                aria-invalid={panBad || undefined}
                className={cn("tabular min-h-11 w-full min-w-0 px-3 text-base uppercase placeholder:text-chestnut/60", fieldClass(panBad))}
              />
            </Row>
            {panBad && <FieldMessage className={cn("mt-0", underValue)}>{t("panBad")}</FieldMessage>}
          </section>
          <h3 className={cn(partHeading, "-mb-2")}>{t("steps.received")}</h3>
        </>
      )}
      {/* wider screens, two rows: on top the supporting details (left); under them the breakup (left) level with what
          it goes towards (right) */}
      <div className="grid gap-4 sm:grid-cols-2 sm:items-start sm:gap-x-12">
        <div className="flex min-w-0 flex-col gap-4 sm:contents">
          {/* the supporting details, on top with room under them. An advance they have with us: the advance, this
              bill, less what's set off from the advance (a switch, as much as the bill takes), then what that leaves:
              an advance still with us, or a due. Otherwise: this bill, the old due and the due they make together */}
          <div className="mb-2 flex min-w-0 flex-col gap-2.5 sm:col-start-1 sm:row-start-1">
            {e.heldAdvance > 0 ? (
              <>
                <Figure label={tr("advancePart")} amount={e.heldAdvance} />
                <Figure label={t("thisBill")} amount={total} />
                <div className="tabular flex items-center justify-between gap-3 text-sm">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span id={setOffLabel}>{t("setOff")}</span>
                    <Switch small on={e.setOffOn} onFlip={e.setSetOffOn} labelledBy={setOffLabel} />
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-base font-semibold">
                    {e.setOff > 0 ? `− ${rupees(e.setOff)}` : rupees(0)}
                  </span>
                </div>
                {/* the advance set off covers the whole bill: what's left of it; otherwise the due */}
                {e.setOff > 0 && dueNow === 0 ? (
                  <Figure label={tr("advancePart")} amount={Math.round((e.heldAdvance - e.setOff) * 100) / 100} strong />
                ) : (
                  <Figure label={tr("due")} amount={dueNow} strong />
                )}
              </>
            ) : (
              <>
                <Figure label={t("thisBill")} amount={total} />
                {oldDue > 0 && <Figure label={t("oldDue")} amount={oldDue} />}
                {oldDue > 0 && <Figure label={tr("due")} amount={dueNow} strong />}
              </>
            )}
          </div>
          {/* the breakup, as a payment's: the amount received in its box (a saved customer's is typed or spoken, any
              part of what's due; a walk-in's is the bill), then the TDS they deducted and an advance set off (a switch
              each), then the total */}
          <div className="flex min-w-0 flex-col gap-2.5 sm:col-start-1 sm:row-start-2">
          {tdsCan ? (
            <Row
              htmlFor="received-field"
              label={
                <>
                  {t("amountReceived")}
                  {e.setOff === 0 && <RequiredMark />}
                </>
              }
            >
              <MicField onText={(said) => saidAmount(said, e.typeReceived)}>
                {rupeeMark(filled)}
                <NumberInput
                  id="received-field"
                  value={e.receivedText}
                  onChange={e.typeReceived}
                  decimals={2}
                  maxDigits={13}
                  placeholder="0"
                  aria-invalid={amountBad || undefined}
                  className={cn(input(amountBad), amountBox, "pr-12", filled && !amountBad && "bg-chestnut text-ivory caret-ivory shadow-none")}
                />
              </MicField>
            </Row>
          ) : (
            <Row label={t("amountReceived")}>
              <span className="tabular flex min-h-12 items-center justify-end rounded-control bg-chestnut px-3.5 font-heading text-xl font-bold text-ivory">
                {rupees(received)}
              </span>
            </Row>
          )}
          {/* the rest of the breakup (the amount itself is the box above), shown before anything is typed too: the TDS
              and the due or advance left */}
          {tdsCan && <PlainRows rows={rows.slice(1)} />}
          <Reveal follow show={tdsCan && tdsOnIt && filled} gap="0.625rem">
            <Note className="text-chestnut/70">{tr("tdsNote194Q")}</Note>
          </Reveal>
          {/* a phone: what it goes towards under the breakup (wider screens: on the right) */}
          {hasTowards && <div className="mt-1.5 sm:hidden">{towards}</div>}
          </div>
        </div>
        {hasTowards && <div className="hidden min-w-0 sm:col-start-2 sm:row-start-2 sm:block">{towards}</div>}
      </div>
      {/* where it came into: a card for each place, once there's an amount */}
      {filled && (
        <div className="flex flex-col gap-2.5 border-t border-chestnut/15 pt-4">
          <AccountCards key={received} api={cards} />
        </div>
      )}
    </div>
  );
}

// the bank cards with a receipt's words and parts, laid out as a payment's (every field a row): no cap at what a place
// holds and no balances shown (money comes in), no Auto. An account by UPI with no UPI ID of ours says to add one
function useSaleCards(): AccountCardsApi {
  const e = useSaleEntry();
  const t = useTranslations("transactions.receipt.form");
  const tpf = useTranslations("transactions.payment.form");
  const tc = useTranslations("transactions.chat");
  return {
    value: e.received,
    places: e.gridPlaces,
    setText: e.setGridText,
    setMode: e.setGridMode,
    tried: e.tried,
    capAtHeld: false,
    hideHeld: true,
    modeRows: true,
    placeFirst: true,
    fieldRows: true,
    qrItems: e.qrItems,
    qrIdLabel: t("upiId"),
    qrId: () => ({ hideId: false }),
    upiPart: (place) =>
      e.upiIdsOf(place.id).length > 0 ? null : <FieldMessage className="mt-0 ml-auto w-[62%]">{e.t("noUpi")}</FieldMessage>,
    refs: e.refs,
    setRefs: e.setRefs,
    refLeft: e.refLeft,
    setRefLeft: e.setRefLeft,
    labels: {
      breakdown: tpf("breakdown"),
      account: tpf("account"),
      accountAmount: t("accountAmount"),
      anotherAccount: tpf("anotherAccount"),
      removeAccount: tc("removeAccount"),
      mode: t("receivedBy"),
      modeMissing: t("pickMode"),
      barLeft: t("leftToReceive"),
      barDone: t("nothingLeft"),
      capLeft: (amount) => t("capLeft", { amount }),
      capOnly: (amount) => t("capLeft", { amount }),
    },
  };
}

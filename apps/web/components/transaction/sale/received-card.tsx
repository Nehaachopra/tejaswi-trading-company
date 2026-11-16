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

// a figure that isn't typed: its name on the left, the figure on the right
function Figure({ label, amount, strong = false }: { label: string; amount: number; strong?: boolean }) {
  return (
    <div className={cn("tabular flex items-baseline justify-between gap-3 text-sm", strong && "border-t border-chestnut/30 pt-2")}>
      <span className="min-w-0">{label}</span>
      <span className={cn("shrink-0 whitespace-nowrap text-base font-semibold", strong && "font-bold")}>{rupees(amount)}</span>
    </div>
  );
}

// the Received card (a cash sale's, after the customer), laid out as a receipt's Amount card. On the left: what's due
// (a customer who owes from before: the old due, this bill and the two together; otherwise just the bill), the amount
// received (a saved customer's is typed: any part of what's due, the rest staying owed, or more, the rest an advance;
// a walk-in's is the bill), and for a saved customer
// the Receipt group with an advance of theirs set off against the bill (a switch, only when they have one) and the TDS they deducted (its switch in the row; the PAN it's deducted against is asked once
// it's on and none is saved). On the right, with an old due: what it goes towards, the old due first. Then the
// account cards, the card's full width. A credit sale to someone who owes from before shows only the three due rows
export function ReceivedCard() {
  const e = useSaleEntry();
  const { t, tc, kind, tried, total, oldDue, dueNow, received, tdsCan, tdsOnIt, panNeeded } = e;
  const tr = useTranslations("transactions.receipt.form");
  const tpf = useTranslations("transactions.payment.form");
  const tdsLabel = useId();
  const setOffLabel = useId();
  const cards = useSaleCards();
  const [towardsOpen, setTowardsOpen] = useState(false);
  const filled = received > 0;
  const amountBad = tried && received === 0 && e.setOff === 0;
  const panBad = tried && panNeeded && !/^[A-Z]{5}\d{4}[A-Z]$/.test(e.pan);
  // the amount's box: large and bold; chestnut, no shadow, once filled
  const amountBox = "min-h-12 pl-11 font-heading text-xl font-bold tabular";
  const rupeeMark = (on: boolean) => (
    <IndianRupee className={cn("pointer-events-none absolute left-3.5 top-1/2 z-10 size-5 -translate-y-1/2", on && "text-ivory")} aria-hidden />
  );

  // the Receipt group's rows: what came in, the TDS they deducted, what the two settle
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
    // an advance they have with us: set off against this bill once switched on (as much as the bill takes)
    ...(e.heldAdvance > 0
      ? [
          {
            key: "setOff",
            label: (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span id={setOffLabel}>{t("setOff")}</span>
                <Switch small on={e.setOffOn} onFlip={e.setSetOffOn} labelledBy={setOffLabel} />
              </span>
            ),
            amount: e.setOff,
          },
        ]
      : []),
    { key: "total", label: tpf("total"), amount: Math.round((e.settles + e.setOff) * 100) / 100, tone: "total" as const },
  ];

  const towards = (
    <FoldGroup title={tr("towardsGroup")} figure={e.settles} open={towardsOpen} onOpen={setTowardsOpen}>
      {/* with an old due: the old due first, then this bill, and any advance under them; without one, as a receipt's:
          the due (this bill) and the advance */}
      <DueFlow
        wholeLabel={tr("receiptGroup")}
        whole={e.settles}
        dueLabel={oldDue > 0 ? t("oldDue") : tr("due")}
        due={oldDue > 0 ? e.towardsOld : e.towardsBill}
        advanceLabel={oldDue > 0 ? t("thisBill") : tr("advancePart")}
        advance={oldDue > 0 ? e.towardsBill : e.advance}
        paidLabel=""
        owedBefore={0}
      />
      {oldDue > 0 && e.advance > 0 && (
        <div className="tabular flex min-h-8 items-center justify-between gap-3 pl-7 text-sm">
          <span>{tr("advancePart")}</span>
          <span className="text-base font-semibold">{rupees(e.advance)}</span>
        </div>
      )}
      <div className="tabular mt-1 flex min-h-8 items-center justify-between gap-3 border-t border-chestnut/15 pt-1 text-sm">
        <span>{t("leftDue")}</span>
        <span className="text-base font-semibold">{rupees(e.leftDue)}</span>
      </div>
    </FoldGroup>
  );
  const hasTowards = filled && (oldDue > 0 || e.advance > 0);

  // a credit sale: only what they'll owe, nothing to type
  if (kind === "credit")
    return (
      <div className="flex flex-col gap-2 sm:max-w-80">
        <Figure label={t("oldDue")} amount={oldDue} />
        <Figure label={t("thisBill")} amount={total} />
        <Figure label={tr("due")} amount={dueNow} strong />
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 sm:items-start sm:gap-x-12">
        <div className="flex min-w-0 flex-col gap-2.5">
          {/* what's due: the old due and this bill making it up, or just the bill */}
          {oldDue > 0 ? (
            <div className="mb-2 flex flex-col gap-2">
              <Figure label={t("oldDue")} amount={oldDue} />
              <Figure label={t("thisBill")} amount={total} />
              <Figure label={tr("due")} amount={dueNow} strong />
            </div>
          ) : (
            <div className="mb-2 flex flex-col gap-2">
              <Figure label={t("thisBill")} amount={total} />
              {/* with the advance set off: what's left of it to pay */}
              {e.setOff > 0 && <Figure label={tr("due")} amount={dueNow} strong />}
            </div>
          )}
          {/* the amount received: a saved customer's is typed (or spoken), any part of what's due; a walk-in's is the bill */}
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
          {/* part of the bill, with nothing owed from before: what stays owed */}
          {tdsCan && filled && oldDue === 0 && e.leftDue > 0 && <Figure label={t("leftDue")} amount={e.leftDue} />}
          {/* an advance they already have with us, until it's set off or more is added to it */}
          <Reveal follow show={e.heldAdvance > 0 && e.advance === 0 && !e.setOffOn} gap="0.625rem">
            <Note className="tabular text-chestnut/70">{tr("heldAdvance", { amount: rupees(e.heldAdvance) })}</Note>
          </Reveal>

          {/* a saved customer: the Receipt group, with the TDS they deducted; then the TDS's note and their PAN */}
          {tdsCan && (filled || e.heldAdvance > 0) && (
            <div className="-mx-3 mt-1.5 flex flex-col gap-1 rounded-control bg-chestnut/6 px-3 py-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-[0.08em] opacity-60">{tr("receiptGroup")}</h3>
              <PlainRows rows={rows} />
            </div>
          )}
          <Reveal follow show={tdsCan && tdsOnIt && filled} gap="0.625rem">
            <Note className="text-chestnut/70">{tr("tdsNote194Q")}</Note>
          </Reveal>
          {tdsCan && filled && panNeeded && (
            <>
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
            </>
          )}
          {/* a phone: what it goes towards under the breakup (wider screens: on the right) */}
          {hasTowards && <div className="mt-1.5 sm:hidden">{towards}</div>}
        </div>
        {hasTowards && <div className="hidden min-w-0 sm:block">{towards}</div>}
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

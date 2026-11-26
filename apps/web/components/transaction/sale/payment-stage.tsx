"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { fieldClass } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { Note } from "~/components/ui/note";
import { RequiredMark } from "~/components/ui/required-mark";
import { Switch } from "~/components/ui/switch";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { FixedBanner, TypedBanner } from "../shared/amount-banner";
import { type AccountCardsApi } from "../shared/account-cards/types";
import { Figure, type LeftItem, PaymentStage as SharedStage } from "../shared/payment-stage";
import { SALE_TDS_RATE, useSaleEntry } from "./state";

// a row: its name on the left (level with the box's first line), its box on the right, as a receipt's
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

// a part's heading inside the stage (PAN, then Received), as the stage's own name reads
const partHeading = "text-xs font-semibold uppercase tracking-[0.08em] opacity-60";

// a cash sale's payment stage (Received, after the customer), on the shared one. A saved customer's: what's left with
// arrows to the breakup, To receive (typed), Left to receive and the cards; the breakup adds the TDS they deducted (a
// switch; their PAN is asked above once TDS is on and none is saved) after what the receipt goes towards. A walk-in pays
// the bill: To receive (the bill, fixed), then Left to receive and the cards (an exchange: the bill and the return taken
// off it first)
export function PaymentStage() {
  const e = useSaleEntry();
  const { t, tc, tried, total, oldDue, dueNow, received, tdsCan, tdsOnIt, panNeeded } = e;
  const tr = useTranslations("transactions.receipt.form");
  const tdsLabel = useId();
  const saleCards = useSaleCards();
  const filled = received > 0;
  const amountBad = tried && received === 0 && e.setOff === 0;
  const panBad = tried && panNeeded && !/^[A-Z]{5}\d{4}[A-Z]$/.test(e.pan);
  // their PAN is asked: TDS on, an amount in, none saved
  const askPan = tdsCan && filled && panNeeded;
  const cards = saleCards;
  const common = {
    idPrefix: "sale",
    breakupLabel: t("breakup"),
    amount: received,
    placed: e.gridTotal,
    leftLabel: tr("leftToReceive"),
    nothingLeftLabel: tr("nothingLeft"),
    cards,
  };

  // a walk-in pays the bill: only what's to be received (an exchange's: the bill and the return taken off it first;
  // what the return has over the bill is paid back in cash)
  if (!tdsCan)
    return (
      <SharedStage
        {...common}
        breakup={null}
        top={
          e.exchange && (
            <div className="flex flex-col gap-2 sm:w-[calc(50%-1.5rem)]">
              <Figure label={t("exchange.bill")} amount={rupees(total)} />
              <Figure label={t("exchange.return")} amount={`− ${rupees(e.exchangeIn)}`} />
              {e.exchangePayBack > 0 && <Figure strong label={t("exchange.payBack")} amount={rupees(e.exchangePayBack)} />}
            </div>
          )
        }
        amountBox={received > 0 && <FixedBanner label={t("toReceiveOnly")} amount={received} />}
      />
    );

  // the advance still with us after this sale: what wasn't set off against the bill, and what's paid over what's due
  const advanceLeft = Math.round((e.heldAdvance - e.setOff + e.advance) * 100) / 100;
  // what's left: both when both are above nothing (the advance first); otherwise the one that is; neither: ₹0 of what
  // the account had (an advance when it held one and owed nothing, a due otherwise)
  const left: LeftItem[] =
    e.leftDue > 0 && advanceLeft > 0
      ? [
          { key: "advance", label: t("advanceLeft"), amount: advanceLeft },
          { key: "due", label: t("leftDue"), amount: e.leftDue },
        ]
      : e.leftDue > 0
        ? [{ key: "due", label: t("leftDue"), amount: e.leftDue }]
        : advanceLeft > 0 || (e.heldAdvance > 0 && oldDue === 0)
          ? [{ key: "advance", label: t("advanceLeft"), amount: advanceLeft }]
          : [{ key: "due", label: t("leftDue"), amount: 0 }];
  // on the left: Due left always, ₹0 too (with an advance left, under it)
  const leftSide = left.some((l) => l.key === "due") ? left : [...left, { key: "due", label: t("leftDue"), amount: 0 }];

  return (
    <SharedStage
      {...common}
      leftSide={leftSide}
      // their PAN (TDS on, an amount in, none saved): under its own heading above the Received heading (the stage's own
      // name is hidden then)
      top={askPan && <PanPart pan={e.pan} setPan={e.setPan} bad={panBad} />}
      // To receive: typed (a customer's)
      amountBox={
        <TypedBanner
          id="received-field"
          label={t("toReceiveOnly")}
          value={e.receivedText}
          onChange={e.typeReceived}
          invalid={amountBad}
          required={e.setOff === 0}
        />
      }
      breakup={{
        heldAdvance: e.heldAdvance,
        advanceLabel: tr("advancePart"),
        oldDue,
        oldDueLabel: t("oldDue"),
        bill: total,
        billLabel: t("thisBill"),
        subTotalLabel: t("subTotal"),
        setOff: { on: e.setOffOn, flip: e.setSetOffOn, amount: e.setOff, label: t("setOff") },
        due: dueNow,
        dueLabel: tr("due"),
        // the amount received taken off, its ⌄ opening what it goes towards
        pay: { label: tr("receiptGroup"), toggleLabel: tr("towardsGroup"), amount: received, whole: e.settles, towardsOld: e.towardsOld, towardsBill: e.towardsBill, paidLabel: "" },
        // the TDS they deducted: a switch, its rate once on
        afterPay: (
          <Figure
            label={
              <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span id={tdsLabel}>{tc("sum.tds")}</span>
                <Switch small on={tdsOnIt} onFlip={e.flipTds} labelledBy={tdsLabel} />
                {tdsOnIt && <span className="tabular text-xs font-semibold">{SALE_TDS_RATE}%</span>}
              </span>
            }
            amount={e.tdsAmount > 0 ? `− ${rupees(e.tdsAmount)}` : rupees(0)}
          />
        ),
        left,
        footer: tdsOnIt && filled && <Note className="text-chestnut/70">{tr("tdsNote194Q")}</Note>,
      }}
    />
  );
}

// the customer's PAN (TDS on, an amount in, none saved): under its own heading, above the Received heading (the stage's
// own name is hidden then). The sale's and its edit's
export function PanPart({ pan, setPan, bad }: { pan: string; setPan: (v: string) => void; bad: boolean }) {
  const t = useTranslations("transactions.sale");
  return (
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
            value={pan}
            maxLength={10}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="ABCDE1234F"
            onChange={(ev) =>
              setPan(
                ev.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, 10),
              )
            }
            aria-invalid={bad || undefined}
            className={cn("tabular min-h-11 w-full min-w-0 px-3 text-base uppercase placeholder:text-chestnut/60", fieldClass(bad))}
          />
        </Row>
        {bad && <FieldMessage className={cn("mt-0", underValue)}>{t("panBad")}</FieldMessage>}
      </section>
      <h3 className={cn(partHeading, "-mb-2")}>{t("steps.received")}</h3>
    </>
  );
}

// the bank cards with a receipt's words and parts, laid out as a payment's (every field a row): no cap at what a place
// holds and no balances shown (money comes in), no Auto; Left to receive and its slider sit above them. An account by
// UPI with no UPI ID of ours says to add one
export function useSaleCards(): AccountCardsApi {
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
    meterOutside: true,
    modeRows: true,
    placeFirst: true,
    fieldRows: true,
    qrItems: e.qrItems,
    qrIdLabel: t("upiId"),
    qrId: () => ({ hideId: false }),
    upiPart: (place) =>
      e.upiIdsOf(place.id).length > 0 ? null : (
        <FieldMessage className="mt-0 ml-auto w-[62%]">{e.t("noUpi")}</FieldMessage>
      ),
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

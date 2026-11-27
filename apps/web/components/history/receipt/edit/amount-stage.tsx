"use client";

import { SCRAP_GST } from "@repo/trpc/client";
import { IndianRupee } from "lucide-react";
import { useId } from "react";

import { FieldMessage } from "~/components/ui/field-message";
import { Note } from "~/components/ui/note";
import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { Switch } from "~/components/ui/switch";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { AccountCards } from "../../../transaction/shared/account-cards/account-cards";
import { type AccountCardsApi } from "../../../transaction/shared/account-cards/types";
import { type AmountRow, PlainRows } from "../../../transaction/shared/amount-table";
import { input } from "../../../transaction/shared/form-basics";
import { useReceiptEdit } from "./state";

// the Amount stage, as a new receipt's Amount card: the amount in its box (no lower than a loan's repaid part, no
// higher than what was left of a loan given), any TDS they deducted (its switch in the row, the law's rate), a scrap
// sale's GST taken out of it; then a card for each place it came into, with how and its reference. A place whose money
// is already spent says how much must stay there
export function AmountStage() {
  const e = useReceiptEdit();
  const cards = useEditCards();
  const tdsLabel = useId();
  const r = e.receipt;
  const bad = (e.tried && e.amount === 0) || e.tooLow || e.tooHigh;
  const filled = e.amount > 0 && !bad;

  // the breakup under the amount: a scrap sale's price before GST and its GST; any TDS and what it settles
  const rows: AmountRow[] = r.scrap
    ? (() => {
        const taxable = Math.round((e.amount * 100 * 100) / (100 + SCRAP_GST.rate)) / 100;
        return [
          { key: "price", label: e.tr("scrapPrice"), amount: taxable },
          { key: "gst", label: e.tr("scrapGst", { rate: SCRAP_GST.rate }), amount: Math.round((e.amount - taxable) * 100) / 100 },
        ];
      })()
    : r.tdsRate !== null
      ? [
          {
            key: "tds",
            label: (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span id={tdsLabel}>{e.tc("sum.tds")}</span>
                <Switch small on={e.tdsOnIt} onFlip={e.setTdsOnIt} labelledBy={tdsLabel} />
                {e.tdsOnIt && <span className="tabular text-xs font-semibold">{r.tdsRate}%</span>}
              </span>
            ),
            amount: e.tds,
          },
          { key: "total", label: e.tpf("total"), amount: Math.round((e.amount + e.tds) * 100) / 100, tone: "total" },
        ]
      : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-2.5 sm:max-w-md">
        {/* the amount: its name on the left, its box on the right */}
        <div className="flex min-w-0 items-start justify-between gap-3">
          <label htmlFor="amount-field" className="flex min-h-11 min-w-0 items-center text-sm">
            {e.tc("q.amount")}
            <RequiredMark />
          </label>
          <span className="relative block w-[60%] shrink-0 [&_input]:text-right">
            <IndianRupee className={cn("pointer-events-none absolute left-3.5 top-1/2 z-10 size-5 -translate-y-1/2", filled && "text-ivory")} aria-hidden />
            <NumberInput
              id="amount-field"
              value={e.amountText}
              onChange={e.typeAmount}
              decimals={2}
              maxDigits={13}
              max={r.maxAmount ?? undefined}
              placeholder="0"
              aria-invalid={bad || undefined}
              className={cn(input(bad), "min-h-12 pl-11 font-heading text-xl font-bold tabular", filled && "bg-chestnut text-ivory caret-ivory shadow-none")}
            />
          </span>
        </div>
        {/* its limits, when it's past them */}
        {e.tooLow && <FieldMessage className="ml-auto mt-0 w-[60%]">{e.te("minLoan", { amount: rupees(r.minAmount!) })}</FieldMessage>}
        {e.tooHigh && <FieldMessage className="ml-auto mt-0 w-[60%]">{e.te("maxLoan", { amount: rupees(r.maxAmount!) })}</FieldMessage>}
        {rows.length > 0 && <PlainRows rows={rows} />}
        {e.tdsOnIt && r.tdsRate !== null && <Note className="text-chestnut/70">{e.tr(r.receivedFor === "interestReceived" ? "tdsNote194A" : "tdsNote194Q")}</Note>}
      </div>

      {/* where it came into: a card for each place, the stage's full width */}
      <div className="flex flex-col gap-2.5 border-t border-chestnut/15 pt-4">
        {r.bankOnly && <Note className="text-chestnut/70">{e.tr("bankOnly")}</Note>}
        <AccountCards api={cards} />
        {/* money already spent from a place: what must still have come into it */}
        {e.short.map(({ place, least }) => (
          <FieldMessage key={place.id} className="mt-0">
            {place.id === "cash" ? e.te("spentCash", { amount: rupees(least) }) : e.te("spentBank", { amount: rupees(least), bank: `${place.name} ${place.sub ?? ""}`.trim() })}
          </FieldMessage>
        ))}
      </div>
    </div>
  );
}

// the cards with a receipt's words, as a new receipt's: no cap at what a place holds, no balances shown, no QR
function useEditCards(): AccountCardsApi {
  const e = useReceiptEdit();
  return {
    value: e.amount,
    places: e.places,
    setText: e.setText,
    setMode: e.setMode,
    tried: e.tried,
    capAtHeld: false,
    hideHeld: true,
    modeRows: true,
    placeFirst: true,
    fieldRows: true,
    qrItems: [],
    qrId: () => ({ hideId: false }),
    upiPart: () => null,
    refs: e.refs,
    setRefs: e.setRefs,
    refLeft: e.refLeft,
    setRefLeft: e.setRefLeft,
    labels: {
      breakdown: e.tpf("breakdown"),
      account: e.tpf("account"),
      accountAmount: e.tr("accountAmount"),
      anotherAccount: e.tpf("anotherAccount"),
      removeAccount: e.tc("removeAccount"),
      mode: e.tr("receivedBy"),
      modeMissing: e.tr("pickMode"),
      barLeft: e.tr("leftToReceive"),
      barDone: e.tr("nothingLeft"),
      capLeft: (amount) => e.tr("capLeft", { amount }),
      capOnly: (amount) => e.tr("capLeft", { amount }),
    },
  };
}

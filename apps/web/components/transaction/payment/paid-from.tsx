"use client";

import { IndianRupee } from "lucide-react";
import { Note } from "~/components/ui/note";
import { Reveal } from "~/components/ui/reveal";
import { NumberInput } from "~/components/ui/number-input";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";
import { input, money } from "./shared";
import { usePaymentEntry } from "./state";
import { OneAccount, AccountRows } from "./bank-cards";
import { type Place, PlacePicker } from "../shared/place-picker";
import { FailNote, CapWarning } from "./notes";

// where it's paid from: cash, a bank or both, picked from an accordion with the bank accounts' look, each with what
// it holds (the admin only), collapsed to the pick; then one
// panel with a row for each part in use, its amount on the right. The bank's row goes on with how it was paid (two
// by two), the party's QR for UPI, then the account it left. Cash + Bank types either part and the other follows;
// the bank's steps wait for its part. The cash-limit warning closes the panel
export function PaidFrom() {
  const {
    t,
    tc,
    into,
    setInto,
    bankId,
    setBankId,
    cashPart,
    setCashPart,
    cashPartAuto,
    partTyping,
    setPartTyping,
    setCapNote,
    bankTyped,
    setBankTyped,
    setBankMode,
    moreParts,
    setAccountsOpen,
    tried,
    value,
    cashHeld,
    pickedHeld,
    banksHeld,
    canCash,
    canBank,
    cashCovers,
    bankCovers,
    offerBoth,
    cashValue,
    bankValue,
    multi,
    cashLeast,
    bankLeast,
    partsOk,
    raiseToLeast,
    bothBankSet,
    pickBoth,
    cashOver,
    bankOver,
    cashLimit,
    cashTodayFailed,
    retryCashToday,
    cashThatDay,
    overCashLimit,
  } = usePaymentEntry();
  // all three, always, for every kind of payment: one that can't pay it (nothing held, or not enough for this
  // amount) shows muted
  const places: Place<"cash" | "bank" | "both">[] = [
    {
      id: "cash",
      name: tc("cash"),
      hint: cashHeld === null ? undefined : rupees(cashHeld),
      disabled: !(canCash && cashCovers),
    },
    {
      id: "bank",
      name: t("bankPlace"),
      hint: banksHeld === null ? undefined : rupees(banksHeld),
      disabled: !(canBank && bankCovers),
    },
    {
      id: "both",
      name: t("cashAndBank"),
      // all the money there is: cash and every bank account, as Cash and Bank show them
      hint: cashHeld === null || banksHeld === null ? undefined : rupees(cashHeld + banksHeld),
      disabled: !offerBoth,
    },
  ];
  const usesBank = into === "bank" || into === "both";
  return (
    <>
      {/* cash, bank or both as an accordion with the bank accounts' look: all three with what each holds (the admin
          only) until one is picked, then only the pick; one that can't pay it is muted */}
      <PlacePicker
        label={t("steps.source")}
        places={places}
        value={into}
        invalid={tried && into === null}
        onPick={(id) => {
          setBankId(null);
          if (id === "cash") {
            setInto("cash");
            setBankMode(null);
          } else if (id === "both") pickBoth();
          else {
            setInto("bank");
            setAccountsOpen((n) => n + 1);
          }
        }}
      />

      {/* the panel, all in one box: with Cash + Bank a row per part to type; then the bank's steps (straight away when
          it's the bank alone); then the cash-limit warning. Cash alone has only the warning, when there is one */}
      <Reveal follow show={usesBank || overCashLimit || cashTodayFailed} gap="0.625rem">
        <div className="overflow-hidden rounded-control text-sm shadow-[0_0_5px_0] shadow-chestnut/25">
          {into === "both" && partRow("cash")}
          {usesBank && (
            <div className={cn(into === "both" && "border-t border-chestnut/15")}>
              {/* with cash: the bank's part, typed or the rest of the cash part */}
              {into === "both" && partRow("bank")}
              {/* the account cards, card 1 from the start (with cash, once the cash part is in) */}
              <Reveal
                follow
                show={into === "bank" || bothBankSet || moreParts.length > 0}
                gap="0px"
              >
                {multi ? <AccountRows /> : <OneAccount />}
              </Reveal>
            </div>
          )}
          {/* what was paid them in cash today couldn't be had, so the 40A(3) warning can't be checked */}
          <Reveal show={cashTodayFailed} gap="0px">
            <div className={cn("px-3 py-2.5", into !== "cash" && "border-t border-chestnut/15")}>
              {<FailNote text={t("cashTodayFailed")} retry={retryCashToday} />}
            </div>
          </Reveal>
          {/* section 40A(3): a warning only, the payment still saves */}
          <Reveal show={overCashLimit} gap="0px">
            <div className={cn("px-3 py-2.5", into !== "cash" && "border-t border-chestnut/15")}>
              <Note className="text-amber-700">
                {t("cashLimit", { amount: rupees(cashThatDay), limit: rupees(cashLimit) })}
              </Note>
            </div>
          </Reveal>
        </div>
      </Reveal>
    </>
  );

  // a part's row: its name as a heading, then what it holds on the left (the admin only) and on the right what it
  // pays. With cash and a bank together it's typed (either fills in the other), otherwise it's the whole amount
  function partRow(part: "cash" | "bank") {
    const both = into === "both";
    const pays = both ? (part === "cash" ? cashValue : Math.max(0, bankValue)) : value;
    // what it holds, always in view while typing (the admin only): cash, the account picked, or before that all the
    // bank accounts together (as Bank shows in Paid from)
    const has = part === "cash" ? cashHeld : bankId ? pickedHeld : banksHeld;
    const name = part === "cash" ? tc("cash") : t("bankPlace");
    // the least it can be, and whether it's below that (only once it's filled in)
    const least = both ? (part === "cash" ? cashLeast : bankLeast) : 0;
    const short = both && cashPart !== "" && partTyping !== part && pays < least;
    const bad =
      short ||
      (part === "cash" ? cashOver || (tried && !partsOk) : bankOver || (tried && !partsOk));
    const Row = both ? "label" : "div";
    // what its field shows: the cash part as typed; the bank's as typed while it's being typed, else the rest
    const typed =
      part === "cash"
        ? cashPart
        : partTyping === "bank"
          ? bankTyped
          : cashPart === ""
            ? ""
            : String(Math.max(0, bankValue));
    // filled in: chestnut, as every amount field
    const fill = Number(typed) > 0 && !bad;
    return (
      <Row className="flex flex-col gap-1.5 px-3 py-2.5">
        {/* its name as a heading; then what it holds on the left, what it pays on the right */}
        <span className="text-xs font-semibold uppercase tracking-[0.08em] opacity-60">{name}</span>
        <span className="flex min-h-11 items-center justify-between gap-3">
          <span className={cn(money, "min-w-0 text-lg text-chestnut")}>
            {has === null ? null : rupees(has)}
          </span>
          {both ? (
            <span className="flex w-40 shrink-0 flex-col items-end gap-1">
              <span className="relative block w-full">
                <IndianRupee
                  className={cn(
                    "pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2",
                    fill && "text-ivory",
                  )}
                  aria-hidden
                />
                <NumberInput
                  value={typed}
                  onFocus={() => setPartTyping(part)}
                  onBlur={() => {
                    setPartTyping(null);
                    raiseToLeast();
                  }}
                  onCapped={(most) =>
                    setCapNote({ key: part, text: t("capOnly", { amount: rupees(most) }) })
                  }
                  onChange={(v) => {
                    setCapNote(null);
                    cashPartAuto.current = false;
                    if (part === "cash") return setCashPart(v);
                    // the bank's part typed: cash is the rest
                    setBankTyped(v);
                    setCashPart(
                      v === ""
                        ? ""
                        : String(Math.max(0, Math.round((value - Number(v)) * 100) / 100)),
                    );
                  }}
                  decimals={2}
                  maxDigits={13}
                  max={
                    part === "cash"
                      ? cashHeld === null
                        ? value
                        : Math.min(cashHeld, value)
                      : Math.min(value, banksHeld ?? value)
                  }
                  placeholder="0"
                  aria-label={name}
                  aria-invalid={bad || undefined}
                  className={cn(
                    input(bad),
                    "min-h-11 pl-8 text-right font-heading text-lg font-bold",
                    fill && "bg-chestnut text-ivory caret-ivory",
                  )}
                />
              </span>
              {/* the least this part can be, when the other can't cover the rest */}
              {least > 0 && (
                <span
                  className={cn(
                    "tabular text-xs",
                    short ? "font-semibold text-danger" : "opacity-70",
                  )}
                >
                  {t("atLeast", { amount: rupees(least) })}
                </span>
              )}
              {<CapWarning at={part} className={"text-right"} />}
            </span>
          ) : (
            <span className={cn(money, "shrink-0 text-lg")}>{rupees(pays)}</span>
          )}
        </span>
      </Row>
    );
  }
}

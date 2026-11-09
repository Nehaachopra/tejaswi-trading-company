"use client";

import { IndianRupee } from "lucide-react";

import { Note } from "~/components/ui/note";
import { NumberInput } from "~/components/ui/number-input";
import { Reveal } from "~/components/ui/reveal";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { type Place, PlacePicker } from "../shared/place-picker";
import { AccountRows, OneAccount } from "./bank-cards";
import { input, money } from "./shared";
import { useReceiptEntry } from "./state";

// where it came into: Cash, Bank or Cash + Bank, a button each with what it holds (the admin only), only the pick once
// there is one (a dropdown back to all three); then one panel with
// a row for each part in use, its amount on the right. Cash + Bank types either part and the other follows; the bank's
// account cards wait for its part. A bank's loan comes into a bank only, so Cash and Cash + Bank are muted for it
export function ReceivedInto() {
  const {
    t,
    tc,
    tpf,
    into,
    setInto,
    setBankId,
    setBankMode,
    setCashPart,
    setAccountsOpen,
    tried,
    cashHeld,
    banksHeld,
    canBank,
    bankLoan,
    multi,
    bothBankSet,
  } = useReceiptEntry();
  const places: Place<"cash" | "bank" | "both">[] =
    [
      {
        id: "cash",
        name: tc("cash"),
        hint: cashHeld === null ? undefined : rupees(cashHeld),
        disabled: !!bankLoan,
      },
      {
        id: "bank",
        name: tpf("bankPlace"),
        hint: banksHeld === null ? undefined : rupees(banksHeld),
        disabled: !canBank,
      },
      {
        id: "both",
        name: tpf("cashAndBank"),
        hint: cashHeld === null || banksHeld === null ? undefined : rupees(cashHeld + banksHeld),
        disabled: !canBank || !!bankLoan,
      },
    ];
  const usesBank = into === "bank" || into === "both";
  return (
    <>
      {/* stacked: name left, what it holds right; one that can't take it is muted. Once one is picked only it shows,
          as a dropdown that lists all three again */}
      <PlacePicker
        label={t("steps.into")}
        places={places}
        value={into}
        invalid={tried && into === null}
        onPick={(id) => {
          setBankId(null);
          setCashPart("");
          if (id === "cash") {
            setInto("cash");
            setBankMode(null);
          } else {
            setInto(id);
            // the bank alone: its accounts' list opens by itself
            if (id === "bank") setAccountsOpen((n) => n + 1);
          }
        }}
      />
      {bankLoan && <Note className="text-chestnut/70">{t("bankOnly")}</Note>}

      {/* the panel: with Cash + Bank a row per part to type, then the account cards (straight away for the bank alone) */}
      <Reveal follow show={usesBank} gap="0.625rem">
        <div className="overflow-hidden rounded-control text-sm shadow-[0_0_5px_0] shadow-chestnut/25">
          {into === "both" && <PartRow part="cash" />}
          {usesBank && (
            <div className={cn(into === "both" && "border-t border-chestnut/15")}>
              {into === "both" && <PartRow part="bank" />}
              <Reveal follow show={into === "bank" || bothBankSet || multi} gap="0px">
                {multi ? <AccountRows /> : <OneAccount />}
              </Reveal>
            </div>
          )}
        </div>
      </Reveal>
    </>
  );
}

// Cash + Bank: a part's row, its name as a heading, what it holds on the left (the admin only) and what came into it on
// the right, typed: either fills in the other
function PartRow({ part }: { part: "cash" | "bank" }) {
  const {
    tc,
    tpf,
    value,
    cashPart,
    setCashPart,
    partTyping,
    setPartTyping,
    bankTyped,
    setBankTyped,
    bankValue,
    cashHeld,
    banksHeld,
    bankId,
    bankHeld,
    partsOk,
    tried,
  } = useReceiptEntry();
  const name = part === "cash" ? tc("cash") : tpf("bankPlace");
  const has = part === "cash" ? cashHeld : bankId ? bankHeld(bankId) : banksHeld;
  // what its field shows: the cash part as typed; the bank's as typed while it's being typed, else the rest
  const typed =
    part === "cash"
      ? cashPart
      : partTyping === "bank"
        ? bankTyped
        : cashPart === ""
          ? ""
          : String(Math.max(0, bankValue));
  const bad = tried && !partsOk;
  // filled in: chestnut, as every amount field
  const fill = Number(typed) > 0 && !bad;
  return (
    <label className="flex flex-col gap-1.5 px-3 py-2.5">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] opacity-60">{name}</span>
      <span className="flex min-h-11 items-center justify-between gap-3">
        <span className={cn(money, "min-w-0 text-lg text-chestnut")}>
          {has === null ? null : rupees(has)}
        </span>
        <span className="relative block w-40 shrink-0">
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
            onBlur={() => setPartTyping(null)}
            onChange={(v) => {
              if (part === "cash") return setCashPart(v);
              // the bank's part typed: cash is the rest
              setBankTyped(v);
              setCashPart(
                v === "" ? "" : String(Math.max(0, Math.round((value - Number(v)) * 100) / 100)),
              );
            }}
            decimals={2}
            maxDigits={13}
            max={value}
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
      </span>
    </label>
  );
}

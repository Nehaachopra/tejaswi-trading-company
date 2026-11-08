"use client";

import { DateInput } from "~/components/ui/date-input";
import { FieldMessage } from "~/components/ui/field-message";
import { MicField } from "~/components/ui/mic-button";
import { RequiredMark } from "~/components/ui/required-mark";
import { Spinner } from "~/components/ui/spinner";
import { bankNameIn } from "~/lib/bank-names";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";
import { indiaDay } from "../../account/balance";
import { earliestDay } from "../shared/form-basics";
import { BankRefField, CashRefField } from "../shared/bank-mode";
import { REFERENCE_MAX, REMARKS_MAX, input } from "./shared";
import { usePaymentEntry } from "./state";

// the reference beside the remarks (side by side on a wider screen): the cash part's bill or voucher number, and each
// bank account's UTR or cheque number; the day and Save follow, last
export function DetailsCard() {
  const {
    tc,
    locale,
    banks,
    remarks,
    setRemarks,
    setRefs,
    refLeft,
    setRefLeft,
    tried,
    refAccounts,
    refOf,
    into,
    cashRef,
    setCashRef,
  } = usePaymentEntry();
  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {/* the cash part: any bill or voucher number */}
      {(into === "cash" || into === "both") && (
        <CashRefField value={cashRef} onChange={setCashRef} max={REFERENCE_MAX} />
      )}
      {refAccounts.map((a) => {
        const acc = banks?.find((b) => b.id === a.bankId);
        return (
          <BankRefField
            key={a.key}
            mode={a.mode}
            text={refOf(a)}
            onText={(text) => {
              setRefLeft((l) => l.filter((k) => k !== a.key));
              setRefs((r) => ({ ...r, [a.key]: { mode: a.mode, text } }));
            }}
            left={refLeft.includes(a.key)}
            onLeave={() => setRefLeft((l) => (l.includes(a.key) ? l : [...l, a.key]))}
            tried={tried}
            // which account it's for, once there's more than one
            account={
              refAccounts.length > 1 && acc
                ? `${bankNameIn(acc.bankName, locale)} ••${acc.last4}`
                : undefined
            }
          />
        );
      })}
      <label className="flex flex-col gap-2.5 text-xs font-semibold">
        {tc("q.remarks")}
        <MicField
          onText={(said) =>
            setRemarks((v) => (v.trim() ? `${v.trim()} ${said}` : said).slice(0, REMARKS_MAX))
          }
        >
          <input
            value={remarks}
            maxLength={REMARKS_MAX}
            placeholder={tc("hints.remarks")}
            onChange={(e) => setRemarks(e.target.value)}
            className={cn(input(false), "pr-11")}
          />
        </MicField>
      </label>
    </div>
  );
}

// the day, then Save with the amount on it, and why a save failed
export function SaveBlock() {
  const { tc, tp, isAdmin, creating, day, setDay, saveError, tried, total, saving, save } =
    usePaymentEntry();
  return (
    <>
      <label className="mb-3 flex flex-col gap-2.5 text-xs font-semibold sm:max-w-72">
        <span>
          {tc("q.date")}
          <RequiredMark />
        </span>
        <DateInput
          value={day}
          min={earliestDay(isAdmin)}
          max={indiaDay(new Date())}
          // a day typed outside what the picker offers is left as it was
          onChange={(d) =>
            setDay(
              d !== "" && (d > indiaDay(new Date()) || d < (earliestDay(isAdmin) ?? "")) ? day : d,
            )
          }
          calendarLabel={tc("q.date")}
          aria-invalid={(tried && day === "") || undefined}
          className={input(day === "")}
        />
      </label>
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || creating}
        aria-busy={saving || creating}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-control bg-chestnut font-heading text-lg font-bold text-ivory shadow-md transition-colors hover:bg-chestnut/90 aria-busy:opacity-80"
      >
        {/* the total, as the summary shows it (with any TDS and reverse-charge GST) */}
        {saving || creating ? (
          <>
            <Spinner className="size-5" />
            <span>{tp("saving")}</span>
          </>
        ) : (
          <>
            <span>{tp("save")}</span>
            <span className="tabular">{rupees(total)}</span>
          </>
        )}
      </button>
      {saveError && <FieldMessage className="mt-0">{saveError}</FieldMessage>}
    </>
  );
}

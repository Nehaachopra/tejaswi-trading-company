"use client";

import { IndianRupee } from "lucide-react";

import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { input } from "../shared/form-basics";
import { BankPaidBy } from "./bank-paid-by";
import { HeldBar } from "./salary-table";
import { useSalaryEntry } from "./state";

// a salary: where it's paid from. Cash, then each bank account, a box each: its name and what it holds on the left, the
// amount from it on the right; an account paying something then asks how it paid and its UTR or cheque no. Auto (on to
// start with) fills them from what each holds, cash first; typing turns it off. Short of the total, Next says so. The app shares them over the employees, in order
export function SalarySplit() {
  const { t, places, setSplit, splitAuto, setSplitAuto, splitOk, tried } = useSalaryEntry();
  return (
    <div className="flex flex-col gap-2.5">
      <HeldBar />
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold">
          {t("from")}
          <RequiredMark />
        </h3>
        {/* Auto: filled from what each holds, cash first */}
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
          {t("table.auto")}
          <button
            type="button"
            role="switch"
            aria-checked={splitAuto}
            aria-label={t("table.auto")}
            onClick={() => setSplitAuto(!splitAuto)}
            className={cn(
              "relative h-5 w-9 shrink-0 rounded-full transition-colors",
              splitAuto ? "bg-chestnut" : "bg-chestnut/25",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 size-4 rounded-full bg-ivory shadow transition-all",
                splitAuto ? "left-4.5" : "left-0.5",
              )}
            />
          </button>
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-x-6">
        {places.map((p) => {
          const short = p.held !== null && p.amount > p.held;
          return (
            <div
              key={p.id}
              className={cn(
                "flex min-w-0 flex-col gap-3 rounded-control p-3 shadow-[0_0_5px_0] shadow-chestnut/25",
                p.amount > 0 && "bg-chestnut/8",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 flex-col text-sm">
                  <span className="truncate font-semibold">
                    {p.name}
                    {p.sub && <span className="ml-1.5 font-normal opacity-70">{p.sub}</span>}
                  </span>
                  {p.held !== null && (
                    <span className={cn("text-xs tabular", short && "text-danger")}>
                      {rupees(p.held)}
                    </span>
                  )}
                </span>
                <span className={cn("relative block w-36 shrink-0", p.amount > 0 && "text-ivory")}>
                  <IndianRupee
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
                    aria-hidden
                  />
                  <NumberInput
                    value={p.text}
                    onChange={(v) => setSplit(p.id, v)}
                    decimals={2}
                    maxDigits={13}
                    max={p.held ?? undefined}
                    placeholder="0"
                    aria-label={p.name}
                    aria-invalid={(tried && !splitOk) || short || undefined}
                    className={cn(
                      input(short),
                      "pl-9 text-right font-heading text-lg font-bold tabular",
                      p.amount > 0 && "bg-chestnut text-ivory caret-ivory",
                    )}
                  />
                </span>
              </div>
              {p.id !== "cash" && p.amount > 0 && <BankPaidBy bankId={p.id} />}
            </div>
          );
        })}
      </div>

    </div>
  );
}

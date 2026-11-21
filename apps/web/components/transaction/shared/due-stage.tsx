"use client";

import { useTranslations } from "next-intl";

import { NumberInput } from "~/components/ui/number-input";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { input } from "./form-basics";

// a figure row: its name on the left, the amount on the right (the due bolder)
function Figure({ label, amount, strong = false, minus = false }: { label: string; amount: number; strong?: boolean; minus?: boolean }) {
  return (
    <div className={cn("tabular flex items-baseline justify-between gap-3", strong && "border-t border-chestnut/30 pt-2.5")}>
      <span className={cn("min-w-0 text-sm", strong && "font-semibold")}>{label}</span>
      <span className={cn("shrink-0 whitespace-nowrap", strong ? "font-heading text-lg font-bold" : "text-base font-semibold")}>{minus ? `− ${rupees(amount)}` : rupees(amount)}</span>
    </div>
  );
}

// the due stage shared by sale and purchase on credit (orders have none): the bill amount, the old due (₹0 with none)
// and the due together, whether they owed anything or not, then the credit period in days (30 unless changed;
// emptied: no set period; never more than 365). Half the card wide on a wider screen
export function DueStage({
  bill,
  oldDue,
  due,
  paid,
  days,
  setDays,
  tried,
}: {
  bill: number;
  oldDue: number;
  due: number;
  // an edited sale: what was already paid towards the bill, taken off before the due
  paid?: { label: string; amount: number } | null;
  days: string;
  setDays: (v: string) => void;
  tried: boolean;
}) {
  const t = useTranslations("transactions.purchase");
  const tpf = useTranslations("transactions.payment.form");
  const daysBad = tried && Number(days) > 365;
  return (
    <div className="flex min-w-0 flex-col gap-2.5 sm:w-[calc(50%-1.5rem)]">
      <Figure label={t("billAmount")} amount={bill} />
      <Figure label={t("oldDue")} amount={oldDue} />
      {paid && <Figure label={paid.label} amount={paid.amount} minus />}
      <Figure label={tpf("due")} amount={due} strong />
      {/* the credit period: a box with "days" at its right end */}
      <div className="mt-2 flex min-w-0 items-center justify-between gap-3">
        <label htmlFor="credit-days" className="min-w-0 text-sm">
          {t("creditPeriod")}
        </label>
        <span className="relative block w-[60%] shrink-0">
          <NumberInput
            id="credit-days"
            value={days}
            maxDigits={3}
            max={365}
            placeholder="0"
            onChange={setDays}
            aria-invalid={daysBad || undefined}
            className={cn(input(daysBad), "min-h-12 pr-14 text-right font-heading text-xl font-bold tabular")}
          />
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-chestnut/70">{t("days")}</span>
        </span>
      </div>
    </div>
  );
}

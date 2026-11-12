"use client";

import { IndianRupee, type LucideIcon } from "lucide-react";

import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { money } from "./form-basics";

// a figure shown above an amount field, the same on every transaction form: the cash in hand on a deposit, what's due
// on a receipt or payment. In a box with its icon and name on the left, the amount on the right
export function AmountBox({
  icon: Icon,
  label,
  amount,
  asField = false,
}: {
  icon: LucideIcon;
  label: string;
  amount: number;
  // looks like the amount's own field under it (a payment's due): its name above, then a box with ₹ and the figure in
  // the amount's large letters; only read, never typed in
  asField?: boolean;
}) {
  if (asField)
    return (
      <div className="flex flex-col gap-2.5 text-xs font-semibold">
        <span>{label}</span>
        <p className="relative flex min-h-11 items-center rounded-control pl-10 pr-3 shadow-[0_0_5px_0] shadow-chestnut/40">
          <IndianRupee className="absolute left-3 top-1/2 size-5 -translate-y-1/2" aria-hidden />
          <span className="tabular font-heading text-2xl font-bold">
            {rupees(amount).replace("₹", "").trim()}
          </span>
        </p>
      </div>
    );
  return (
    <p className="flex items-center justify-between gap-3 rounded-control px-3.5 py-2.5 shadow-[0_0_5px_0] shadow-chestnut/25">
      <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 shrink-0" aria-hidden /> <span className="truncate">{label}</span>
      </span>
      <span className={cn(money, "shrink-0 text-lg")}>{rupees(amount)}</span>
    </p>
  );
}

"use client";

import type { LucideIcon } from "lucide-react";

import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { money } from "./form-basics";

// a figure shown above an amount field, the same on every transaction form: the cash in hand on a deposit, what's due
// on a receipt or payment. In a box with its icon and name on the left, the amount on the right
export function AmountBox({
  icon: Icon,
  label,
  amount,
}: {
  icon: LucideIcon;
  label: string;
  amount: number;
}) {
  return (
    <p className="flex items-center justify-between gap-3 rounded-control px-3.5 py-2.5 shadow-[0_0_5px_0] shadow-chestnut/25">
      <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 shrink-0" aria-hidden /> <span className="truncate">{label}</span>
      </span>
      <span className={cn(money, "shrink-0 text-lg")}>{rupees(amount)}</span>
    </p>
  );
}

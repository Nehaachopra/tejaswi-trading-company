"use client";

import { useTranslations } from "next-intl";

import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

// what's owed and how much of it this amount settles: what's left (or paid in full, or the advance past it) over the
// right end of a bar that fills as the amount grows; showDue also puts the present due over its left end, and
// green fills it green instead of chestnut
export function DueBar({
  due,
  settles,
  showDue = false,
  green = false,
}: {
  due: number;
  settles: number;
  showDue?: boolean;
  green?: boolean;
}) {
  const t = useTranslations("transactions.payment.form");
  const covered = Math.min(Math.max(settles, 0), due);
  const left = Math.round((due - settles) * 100) / 100;
  return (
    <div className="flex flex-col gap-1.5">
      <p
        className={cn(
          "tabular flex text-xs font-normal opacity-80",
          showDue ? "justify-between gap-3" : "justify-end",
        )}
      >
        {/* the present due, before this amount */}
        {showDue && (
          <span>
            {t("due")} {rupees(due)}
          </span>
        )}
        <span className="font-semibold">
          {left > 0
            ? t("dueLeft", { amount: rupees(left) })
            : left === 0
              ? t("duePaid")
              : t("dueAdvance", { amount: rupees(-left) })}
        </span>
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={due}
        aria-valuenow={covered}
        aria-valuetext={t("dueOf", { amount: rupees(Math.max(settles, 0)), due: rupees(due) })}
        className={cn(
          "h-2 w-full overflow-hidden rounded-full",
          green ? "bg-success/15" : "bg-chestnut/15",
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none",
            green ? "bg-success" : "bg-chestnut",
          )}
          style={{ width: `${(covered / due) * 100}%` }}
        />
      </div>
    </div>
  );
}

"use client";

import { useLocale, useTranslations } from "next-intl";

import { cn } from "~/lib/utils";
import type { HistoryTransaction } from "~/providers/history";

import { LogCell, LogSection, logDay } from "./returns-log";

// under a purchase return's debit note (not printed): the purchases its replaced packs came back on, oldest first, as
// the Returns rows: each one's ID (with its copy button), bill day and total, opening it. Cancelled: faded, struck
export function ReplacementsLog({ replacements }: { replacements: HistoryTransaction["replacements"] }) {
  const t = useTranslations("history");
  const locale = useLocale();
  if (replacements.length === 0) return null;
  return (
    <LogSection id="replacements-log" heading={t("replacements")}>
      <ul>
        {replacements.map((r) => (
          <li key={r.transactionId} className={cn("border-t border-chestnut/15 first:border-t-0", r.status === "cancelled" && "opacity-60")}>
            <LogCell
              href={`/history/${r.transactionId}`}
              id={r.assignedId}
              day={logDay(new Date(`${r.date}T12:00:00+05:30`), locale)}
              total={r.total}
              struck={r.status === "cancelled"}
              openLabel={t("open")}
            />
          </li>
        ))}
      </ul>
    </LogSection>
  );
}

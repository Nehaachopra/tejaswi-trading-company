"use client";

import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";
import type { HistoryTransaction } from "~/providers/history";

import { HeadShare, LogCell, LogSection, logDay } from "./returns-log";

// under a return's note (not printed): a purchase return's, the purchases its replaced packs came back on, oldest first;
// a sale return's, the sale it made for the items it replaced. As the Returns rows: each one's ID (with its copy
// button), day and total, opening it. Cancelled: faded, struck
// At the right of its heading: how much has come back (a bar, ivory) and `action` (Record replacement). `show`: there
// even with nothing come back yet (said so)
export function ReplacementsLog({
  replacements,
  share,
  action,
  show = false,
}: {
  replacements: HistoryTransaction["replacements"];
  share?: number | null;
  action?: ReactNode;
  show?: boolean;
}) {
  const t = useTranslations("history");
  const locale = useLocale();
  if (replacements.length === 0 && !show) return null;
  return (
    <LogSection
      id="replacements-log"
      heading={t("replacements")}
      right={
        <>
          {share != null && <HeadShare share={share} label={t("replacedBack", { share })} />}
          {action}
        </>
      }
    >
      {replacements.length === 0 ? (
        <p className="px-4 py-3.5 text-sm text-chestnut/65">{t("noReplacements")}</p>
      ) : (
        <ul>
          {replacements.map((r) => (
            <li
              key={r.transactionId}
              className={cn(
                "border-t border-chestnut/15 first:border-t-0",
                r.status === "cancelled" && "opacity-60",
              )}
            >
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
      )}
    </LogSection>
  );
}

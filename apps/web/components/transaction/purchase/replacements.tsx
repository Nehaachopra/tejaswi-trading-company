"use client";

import { Check, ChevronRight, PackageCheck } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { ADD_ON_IVORY } from "~/components/ui/page-styles";
import { titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { HistoryTransaction } from "~/providers/history";

type Replacement = HistoryTransaction["replacements"][number];

// a purchase's replacements, under its returns: first a bar of how many replaced packs have come back (of all sent),
// then the swaps grouped by the day they were sent (each group's return on the right, opening it): each item and how
// many, Back and its day once all have come (a part: how many of how many), Pending until then, and each delivery under
// it (its day, the purchase it came on, opening it, how many). A group with packs still to come has Receive replacement
// (the admin's) under its rows
export function Replacements({ replacements, onReceive }: { replacements: HistoryTransaction["replacements"]; onReceive?: (returnId: string) => void }) {
  const t = useTranslations("transactions.purchase.replacements");
  const locale = useLocale();
  if (replacements.length === 0) return null;
  const dayOf = (d: string, year = true) =>
    new Date(`${d}T12:00:00+05:30`).toLocaleDateString(`${locale}-IN`, { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "Asia/Kolkata" });
  const cameOf = (i: Replacement["items"][number]) => i.deliveries.reduce((a, d) => a + d.quantity, 0);
  // the progress: packs back of packs sent, across every return
  const sent = replacements.reduce((a, r) => a + r.items.reduce((b, i) => b + i.replaced, 0), 0);
  const back = replacements.reduce((a, r) => a + r.items.reduce((b, i) => b + Math.min(i.replaced, cameOf(i)), 0), 0);
  const share = sent === 0 ? 0 : Math.round((back / sent) * 100);

  return (
    <section aria-labelledby="replacements" className="no-print mt-6 flex flex-col">
      <h2 id="replacements" className="pb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ivory/70">
        {t("title")}
      </h2>
      <div className="on-ivory overflow-hidden rounded-control bg-ivory text-chestnut">
        {/* how many have come back */}
        <div className="flex flex-col gap-2 border-b border-chestnut/15 px-4 pb-3 pt-3.5">
          <p className="flex items-baseline justify-between gap-3">
            <b className="tabular font-heading text-[1.375rem] font-extrabold leading-none">{share}%</b>
            <span className="tabular text-[0.8125rem] font-semibold text-chestnut/65">{t("packsBack", { back, sent })}</span>
          </p>
          <div role="progressbar" aria-valuenow={share} aria-valuemin={0} aria-valuemax={100} aria-label={t("title")} className="h-2.5 overflow-hidden rounded-full bg-chestnut/12">
            <i className="block h-full rounded-full bg-success" style={{ width: `${share}%` }} />
          </div>
        </div>

        {/* the swaps, by the day they were sent */}
        {replacements.map((r, k) => {
          const pending = r.items.some((i) => cameOf(i) < i.replaced);
          return (
            <div key={r.returnTransactionId} className={cn(k > 0 && "border-t border-chestnut/15")}>
              <p className="tabular flex items-center justify-between gap-3 px-4 pb-1 pt-2.5 text-xs font-semibold text-chestnut/65">
                <span>{t("sent", { date: dayOf(r.returnDate) })}</span>
                <Link href={`/history/${r.returnTransactionId}`} className="flex items-center gap-0.5 hover:text-chestnut">
                  {r.assignedId}
                  <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              </p>
              {r.items.map((i) => {
                const came = cameOf(i);
                const done = came >= i.replaced;
                const last = i.deliveries.at(-1);
                return (
                  <div key={i.productId} className="tabular flex flex-col gap-1 px-4 pb-3 pt-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 break-words text-sm font-semibold">
                        {titleCase(i.name)} <span className="font-medium text-chestnut/65">×{i.replaced}</span>
                      </span>
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-semibold",
                          done ? "bg-success/12 text-success" : "bg-chestnut/10",
                        )}
                      >
                        {done ? (
                          <>
                            <Check className="size-3.5" aria-hidden /> {t("back", { date: dayOf(last!.date, false) })}
                          </>
                        ) : came > 0 ? (
                          t("part", { came, of: i.replaced })
                        ) : (
                          t("pending")
                        )}
                      </span>
                    </div>
                    {/* each delivery: its day, the purchase it came on, how many */}
                    {i.deliveries.map((d) => (
                      <Link key={d.transactionId} href={`/history/${d.transactionId}`} className="flex items-center gap-1 text-xs text-chestnut/65 hover:text-chestnut">
                        {dayOf(d.date, false)} · {d.assignedId} · ×{d.quantity}
                        <ChevronRight className="size-3.5" aria-hidden />
                      </Link>
                    ))}
                  </div>
                );
              })}
              {/* packs still to come: receive them (the admin's) */}
              {pending && onReceive && (
                <div className="px-4 pb-3.5">
                  <button type="button" onClick={() => onReceive(r.returnTransactionId)} className={cn(ADD_ON_IVORY, "min-h-9")}>
                    <PackageCheck className="size-4" aria-hidden /> {t("receive")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

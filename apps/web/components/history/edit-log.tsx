"use client";

import { Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { rupees } from "~/lib/format";
import type { HistoryTransaction } from "~/providers/history";

// what the log shows of an edit: the date and the total, in this order
const SHOWN = ["date", "total"] as const;

// under a document (not printed): its edits, newest first, as History's rows: when and by whom, then the date and the
// total when they changed, the old one struck off and the new one beside it
export function EditLog({ edits }: { edits: HistoryTransaction["edits"] }) {
  const t = useTranslations("history.editLog");
  const locale = useLocale();
  if (edits.length === 0) return null;

  const when = (at: Date | string) =>
    new Date(at).toLocaleString(`${locale}-IN`, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  // a date in words, a total in rupees
  const show = (field: (typeof SHOWN)[number], v: unknown) =>
    field === "date"
      ? typeof v === "string"
        ? new Date(`${v}T12:00:00+05:30`).toLocaleDateString(`${locale}-IN`, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
        : ""
      : typeof v === "number"
        ? rupees(v)
        : "";

  return (
    // at most this tall, its rows scrolling inside with the heading held at the top while they're in view
    <section aria-labelledby="edit-log" className="no-print mt-6 flex max-h-80 flex-col overflow-y-auto overscroll-contain rounded-control [scrollbar-width:thin]">
      <h2 id="edit-log" className="sticky top-0 z-10 bg-chestnut pb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ivory/70">
        {t("title")}
      </h2>
      <ul className="on-ivory shrink-0 overflow-hidden rounded-control bg-ivory text-chestnut">
        {edits.map((e, i) => (
          <li key={i} className="flex flex-col gap-2 border-t border-chestnut/15 px-4 py-3 first:border-t-0">
            {/* when and by whom */}
            <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm font-semibold">
              <span className="flex items-center gap-1.5">
                <Pencil className="size-3.5" aria-hidden />
                {when(e.at)}
              </span>
              <span className="text-xs font-normal text-chestnut/70">{e.byName}</span>
            </p>
            {/* the date and the total, when they changed: the old one struck off, then the new */}
            <dl className="tabular flex flex-col gap-1 text-sm">
              {SHOWN.map((field) => {
                const c = e.changes.find((x) => x.field === field);
                if (!c) return null;
                return (
                  <div key={field} className="flex items-baseline justify-between gap-3">
                    <dt className="min-w-0 truncate text-chestnut/70">{t(`fields.${field}`)}</dt>
                    <dd className="flex shrink-0 items-baseline gap-2 font-semibold">
                      <s className="font-normal opacity-60">{show(field, c.old)}</s>
                      {show(field, c.new)}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}

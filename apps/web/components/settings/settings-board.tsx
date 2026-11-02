"use client";

import { useTranslations } from "next-intl";

import { PAGE } from "~/components/ui/page-styles";
import { Spinner } from "~/components/ui/spinner";
import { Switch } from "~/components/ui/switch";
import { trpc } from "~/trpc/client";

// a financial year as shown: its hyphen doesn't break, so "2026-27" stays on one line
const shown = (year: string) => year.replace("-", "‑");

// the year before a financial year: "2026-27" → "2025-26"
const yearBefore = (year: string) => {
  const y = Number(year.slice(0, 4)) - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
};

type Page = { financialYear: string; taxAudit: boolean; tds194q: boolean };

// the website's settings: which TDS this financial year has, from last year's turnover (above ₹1 crore: rent,
// transport, labour and brokerage; above ₹10 crore: suppliers too, section 194Q)
export function SettingsBoard() {
  const t = useTranslations("settings");
  const utils = trpc.useUtils();
  const page = trpc.settings.page.useQuery();

  // a toggle flips at once and is put back if the save fails; the server answers with both (one may move the other)
  const flip = (patch: Partial<Page>) => {
    const before = utils.settings.page.getData();
    if (before) utils.settings.page.setData(undefined, { ...before, ...patch });
    return { before };
  };
  const undo = (_e: unknown, _v: unknown, ctx?: { before?: Page }) => ctx?.before && utils.settings.page.setData(undefined, ctx.before);
  const keep = (saved: Page) => utils.settings.page.setData(undefined, saved);
  const setAudit = trpc.settings.setTaxAudit.useMutation({ onMutate: ({ on }) => flip({ taxAudit: on, ...(on ? {} : { tds194q: false }) }), onError: undo, onSuccess: keep });
  const setTds = trpc.settings.setTds194q.useMutation({ onMutate: ({ on }) => flip({ tds194q: on, ...(on ? { taxAudit: true } : {}) }), onError: undo, onSuccess: keep });

  return (
    <main className={`${PAGE} flex flex-col gap-4 pb-16`}>
      <h1 className="sr-only">{t("title")}</h1>

      {page.isPending && (
        <p className="flex items-center gap-2">
          <Spinner />
        </p>
      )}

      {/* TDS: last year's turnover decides which TDS this year has */}
      {page.data && (
        <section aria-labelledby="settings-tds" className="flex flex-col gap-4 rounded-control bg-ivory p-4 text-chestnut">
          <h2 id="settings-tds" className="text-xs font-semibold uppercase tracking-[0.16em] text-chestnut/60">
            {t("tds")}
          </h2>
          <Toggle
            id="settings-audit"
            label={t("turnoverAudit", { lastYear: shown(yearBefore(page.data.financialYear)) })}
            hint={t("auditHint", { year: shown(page.data.financialYear) })}
            on={page.data.taxAudit}
            busy={setAudit.isPending || setTds.isPending}
            onFlip={(on) => setAudit.mutate({ on })}
          />
          <div className="border-t border-chestnut/15" />
          <Toggle
            id="settings-turnover"
            label={t("turnover", { lastYear: shown(yearBefore(page.data.financialYear)) })}
            hint={t("tdsHint", { year: shown(page.data.financialYear) })}
            on={page.data.tds194q}
            busy={setAudit.isPending || setTds.isPending}
            onFlip={(on) => setTds.mutate({ on })}
          />
          {(setTds.isError || setAudit.isError) && (
            <p role="alert" className="text-sm font-medium text-danger">
              {t("saveError")}
            </p>
          )}
        </section>
      )}
    </main>
  );
}

// one setting: what it is, what it does, and its switch
function Toggle({ id, label, hint, on, busy, onFlip }: { id: string; label: string; hint: string; on: boolean; busy: boolean; onFlip: (on: boolean) => void }) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span id={id} className="font-semibold">
          {label}
        </span>
        <span className="text-sm text-chestnut/70">{hint}</span>
      </div>
      <Switch on={on} onFlip={onFlip} labelledBy={id} disabled={busy} />
    </div>
  );
}

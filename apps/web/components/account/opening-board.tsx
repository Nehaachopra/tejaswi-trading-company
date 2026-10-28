"use client";

import { CircleAlert, Lock, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { ClearButton } from "~/components/ui/clear-button";
import { fieldClass, SubmitButton } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { NumberInput } from "~/components/ui/number-input";
import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";
import type { RouterOutputs } from "@repo/trpc/client";

import { type Head, indiaDay, startOfIndiaDay, usualSide } from "./balance";
import { useLedgerName } from "./ledger-name";
import { SHELL_WIDTH } from "../shell/nav-items";
import { SignedAmount } from "./signed-amount";

type Row = RouterOutputs["accounts"]["opening"]["get"]["rows"][number];

const HEADS = ["asset", "liability", "income", "expense"] as const;
// the sub-groups in each head, in the order /account shows them
const MASTERS: Record<(typeof HEADS)[number], string[]> = {
  asset: ["bank", "debtors", "debtorCreditors", "parties"],
  liability: ["creditors", "employees"],
  income: [],
  expense: [],
};

// an amount as typed, signed by its head, in paise on the debit side (debit plus, credit minus)
const debitPaise = (typed: string, head: Head) => {
  const value = Number(typed);
  if (typed.trim() === "" || !Number.isFinite(value)) return 0;
  return Math.round(value * 100) * (usualSide(head) === "debit" ? 1 : -1);
};

// /account/opening, admin only: every ledger's opening balance on one page, on the one date the books start.
// Grouped by head and sub-group; each amount is signed by its head (a minus puts it on the other side); a ledger
// with other entries is locked. Capital takes the other side of all of them, worked out as you type; one save
// writes them all
export function OpeningBoard() {
  const tc = useTranslations("common");
  const t = useTranslations("accounts.opening");
  const th = useTranslations("accounts.overview.heads");
  const tm = useTranslations("accounts.overview.masters");
  const tn = useTranslations("shell.nav");
  const nameOf = useLedgerName();
  const utils = trpc.useUtils();
  const sheet = trpc.accounts.opening.get.useQuery();
  const save = trpc.accounts.opening.save.useMutation();

  const [date, setDate] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // fill the page from what's saved, once it loads, so a live refresh doesn't overwrite what's being typed
  const loaded = !!sheet.data;
  useEffect(() => {
    if (!sheet.data) return;
    setDate(sheet.data.date ? indiaDay(sheet.data.date) : "");
    setAmounts(
      Object.fromEntries(
        sheet.data.rows.map((r) => [r.ledgerId, r.opening ? `${r.opening.side === usualSide(r.head) ? "" : "-"}${r.opening.amount}` : ""]),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it first loads
  }, [loaded]);

  const rows = sheet.data?.rows ?? [];
  const needle = search.trim().toLowerCase();
  const shown = (r: Row) => needle === "" || nameOf(r).toLowerCase().includes(needle);
  // Capital is the other side of everything: the rows' total on the debit side, turned round (debit plus)
  const capitalPaise = -rows.reduce((sum, r) => sum + debitPaise(amounts[r.ledgerId] ?? "", r.head), 0);
  const capital = { amount: Math.abs(capitalPaise) / 100, side: capitalPaise > 0 ? ("debit" as const) : ("credit" as const) };
  const anyAmount = rows.some((r) => debitPaise(amounts[r.ledgerId] ?? "", r.head) !== 0);
  const dateMissing = anyAmount && date === "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setError(null);
    if (dateMissing) return setError(t("errors.date"));
    try {
      await save.mutateAsync({
        date: startOfIndiaDay(date || indiaDay(new Date())),
        lines: rows
          .filter((r) => !r.locked)
          .map((r) => {
            const paise = debitPaise(amounts[r.ledgerId] ?? "", r.head);
            return { ledgerId: r.ledgerId, opening: paise === 0 ? null : { amount: Math.abs(paise) / 100, side: paise > 0 ? ("debit" as const) : ("credit" as const) } };
          }),
      });
      toast.success(t("saved"));
      void utils.accounts.invalidate();
    } catch (err) {
      const data = (err as { data?: { code?: string } })?.data;
      setError(t(`errors.${data ? "failed" : "network"}`));
    }
  }

  // one ledger's row: its name, and its amount (or its locked amount)
  const line = (r: Row) => (
    <li key={r.ledgerId} className="flex min-h-12 items-center gap-3 px-4 py-1.5">
      <span className="min-w-0 flex-1 truncate font-medium" title={nameOf(r)}>
        {nameOf(r)}
      </span>
      {r.locked ? (
        <span className="flex shrink-0 items-center gap-2 text-sm" title={t("locked")}>
          {r.opening ? <SignedAmount balance={r.opening} head={r.head} /> : "—"}
          <Lock className="size-4" aria-label={t("locked")} />
        </span>
      ) : (
        <NumberInput
          value={amounts[r.ledgerId] ?? ""}
          decimals={2}
          maxDigits={13}
          negative
          onChange={(v) => setAmounts((all) => ({ ...all, [r.ledgerId]: v }))}
          placeholder="0"
          aria-label={nameOf(r)}
          className={cn("tabular min-h-10 w-40 shrink-0 px-3 text-right text-base sm:w-48", fieldClass(false))}
        />
      )}
    </li>
  );

  return (
    <main className="mx-auto max-w-3xl px-4 pb-28 pt-6 sm:px-6">
      <h1 className="sr-only">{t("title")}</h1>

      {sheet.isPending ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner /> {t("loading")}
        </p>
      ) : sheet.isError ? (
        <p role="alert" className="mt-16 flex items-center justify-center gap-2">
          <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
        </p>
      ) : (
        <form onSubmit={submit} noValidate>
          {/* the date the books start and a search, under the header while the ledgers scroll by */}
          <div className="sticky top-16 z-20 -mx-4 flex flex-wrap items-end gap-3 bg-chestnut px-4 py-3 sm:-mx-6 sm:px-6">
            <label className="flex flex-col gap-1 text-sm text-ivory">
              {t("startsOn")}
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={(tried && dateMissing) || undefined}
                className={cn("min-h-11 rounded-control border bg-transparent px-3 text-base text-ivory outline-none [color-scheme:dark]", tried && dateMissing ? "border-2 border-danger" : "border-ivory/50 focus:border-ivory")}
              />
            </label>
            <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-control border border-ivory/40 px-3 focus-within:border-ivory">
              <Search className="size-4 shrink-0 text-ivory/70" aria-hidden />
              <span className="sr-only">{t("search")}</span>
              <input
                type="search"
                value={search}
                maxLength={150}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("search")}
                className="min-w-0 flex-1 bg-transparent text-base text-ivory outline-none placeholder:text-ivory/60"
              />
              {search && <ClearButton onClear={() => setSearch("")} label={tc("clearSearch")} />}
            </label>
          </div>

          {/* each head: its sub-groups' ledgers, then its own */}
          <div className="mt-4 flex flex-col gap-6">
            {HEADS.map((head) => {
              const mine = rows.filter((r) => r.head === head && shown(r));
              if (mine.length === 0) return null;
              const groups = MASTERS[head].map((m) => ({ key: m, rows: mine.filter((r) => r.masterKey === m) })).filter((g) => g.rows.length > 0);
              const own = mine.filter((r) => r.masterKey === null).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
              return (
                <section key={head} aria-label={th(head)}>
                  <h2 className="mb-2 flex items-center gap-2 font-heading text-xl font-bold">
                    {th(head)}
                    <span className={cn("rounded-control border px-1.5 py-px text-[0.65rem] font-semibold uppercase tracking-wide", usualSide(head) === "debit" ? "border-ivory bg-ivory text-chestnut" : "border-ivory text-ivory")}>
                      {tn(usualSide(head))}
                    </span>
                  </h2>
                  <div className="on-ivory overflow-hidden rounded-control bg-ivory text-chestnut">
                    {groups.map((g) => (
                      <div key={g.key}>
                        <p className="bg-[color-mix(in_srgb,var(--color-ivory)_90%,var(--color-chestnut))] px-4 py-1.5 text-xs font-semibold">{tm(g.key)}</p>
                        <ul className="divide-y divide-chestnut/10">{g.rows.map(line)}</ul>
                      </div>
                    ))}
                    {own.length > 0 && <ul className="divide-y divide-chestnut/10 border-t border-chestnut/10 first:border-t-0">{own.map(line)}</ul>}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Capital, worked out, and the one save, at the foot of the screen */}
          <div className="fixed inset-x-0 bottom-16 z-20 lg:bottom-0">
            {/* within the app's width, beside the sidebar */}
            <div className={cn(SHELL_WIDTH, "lg:pl-60")}>
              <div className="border-t border-chestnut/15 bg-ivory text-chestnut">
                <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
                  <p className="min-w-0 flex-1 text-sm">
                    {t("capital")} <SignedAmount balance={capital} head="liability" className="font-heading text-lg font-bold" />
                  </p>
                  {error && (
                    <div className="w-full">
                      <FieldMessage>{error}</FieldMessage>
                    </div>
                  )}
                  <SubmitButton busy={save.isPending}>
                    <span className="px-6">{t("save")}</span>
                  </SubmitButton>
                </div>
              </div>
            </div>
          </div>
        </form>
      )}
    </main>
  );
}

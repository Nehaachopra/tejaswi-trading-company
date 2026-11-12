"use client";

import { CircleAlert, Pencil, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  ADD_BUTTON,
  FILTER_CONTROL,
  FILTER_ROW,
  FILTER_STACK,
  PAGE,
} from "~/components/ui/page-styles";
import { ClearButton } from "~/components/ui/clear-button";
import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { cn } from "~/lib/utils";
import { useBankName } from "~/lib/bank-names";
import { trpc } from "~/trpc/client";

import { BankSheet } from "../account/bank/bank-sheet";
import { chip } from "../product/row-styles";

// /entities/banks, admin only: where bank accounts are added, edited and made inactive (Accounts only shows their
// ledgers). + Add bank account, then a search (bank, branch, IFSC or account number) with Show inactive, both
// staying under the header, then a row per account: bank ••last 4 and type, branch and IFSC; tapping a row edits
// it, its ⋯ menu also marks it inactive or active
export function BanksManager() {
  // bank names in the language picked
  const bankName = useBankName();
  const tc = useTranslations("common");
  const t = useTranslations("banks");
  const tb = useTranslations("accounts.bank");
  const utils = trpc.useUtils();
  const setActive = trpc.accounts.bank.setActive.useMutation();
  const [showInactive, setShowInactive] = useState(false);
  const banks = trpc.accounts.bank.list.useQuery({ includeInactive: showInactive });
  const [search, setSearch] = useState("");
  // the sheet: a new account, or the one being edited
  const [open, setOpen] = useState<string | "new" | null>(null);

  const needle = search.trim().toLowerCase();
  const shown = (banks.data ?? []).filter(
    (b) =>
      needle === "" ||
      [
        b.bankName,
        b.branchName,
        b.ifscCode ?? "",
        b.accountNumber,
        ...b.upiIds.map((u) => u.upiId),
      ].some((v) => v.toLowerCase().includes(needle)),
  );

  // mark an account inactive (only at a zero balance) or active again
  async function toggleActive(id: string, name: string, makeActive: boolean) {
    try {
      await setActive.mutateAsync({ id, isActive: makeActive });
      toast.success(tb(makeActive ? "toast.reactivated" : "toast.deactivated", { name }));
      void utils.accounts.invalidate();
    } catch (err) {
      const code = (err as { data?: { code?: string } })?.data?.code;
      toast.error(
        tb(
          code === "PRECONDITION_FAILED"
            ? "errors.hasBalance"
            : code === undefined
              ? "errors.network"
              : "errors.failed",
        ),
      );
    }
  }

  return (
    <main className={`${PAGE} pb-16`}>
      <h1 className="sr-only">{t("title")}</h1>

      {/* search and Show inactive, under the header while the list scrolls */}
      <div className={`mt-3 ${FILTER_STACK}`}>
        {/* as a head's header on the account pages: the name and how many there are on the left, the filters and the
            search on the right (each its own row on a phone) */}
        <div className={FILTER_ROW}>
          <h2 className="shrink-0 font-heading text-2xl font-bold">{t("title")}</h2>
          <span className="tabular ml-1 shrink-0 rounded-control bg-ivory px-2.5 py-0.5 font-heading text-lg font-bold text-chestnut">
            {shown.length}
          </span>
          <span className="basis-full sm:hidden" aria-hidden />
          <span className="hidden flex-1 sm:block" aria-hidden />
          {/* the filters, then the search at the right end */}
          <button
            type="button"
            aria-pressed={showInactive}
            onClick={() => setShowInactive((v) => !v)}
            className={cn(chip(showInactive), FILTER_CONTROL)}
          >
            {tb("showInactive")}
          </button>
          <label className="flex min-h-12 w-full min-w-0 items-center gap-2 rounded-control border border-ivory/40 px-3 focus-within:border-ivory sm:w-56">
            <Search className="size-4 shrink-0 text-ivory/70" aria-hidden />
            <span className="sr-only">{tb("search")}</span>
            <input
              type="search"
              value={search}
              maxLength={50}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tb("search")}
              className="min-w-0 flex-1 bg-transparent text-base text-ivory outline-none placeholder:text-ivory/60"
            />
            {search && <ClearButton onClear={() => setSearch("")} label={tc("clearSearch")} />}
          </label>
        </div>
        {/* + Add under the search and filters, at the right end (full width on a phone) */}
        <div className={cn(FILTER_ROW, "sm:justify-end")}>
          <button
            type="button"
            onClick={() => setOpen("new")}
            className={cn(ADD_BUTTON, "shrink-0")}
          >
            <Plus className="size-5" aria-hidden /> {tb("add")}
          </button>
        </div>
      </div>

      {/* the accounts */}
      {banks.isPending ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner /> {tb("loading")}
        </p>
      ) : banks.isError ? (
        <p role="alert" className="mt-16 flex items-center justify-center gap-2">
          <CircleAlert className="size-4" aria-hidden /> {tb("loadError")}
        </p>
      ) : shown.length === 0 ? (
        <p className="mt-16 text-center text-ivory/70">{needle ? tb("noMatch") : tb("empty")}</p>
      ) : (
        <ul className="mt-4 grid gap-3 lg:grid-cols-2">
          {shown.map((b) => {
            const name = `${bankName(b.bankName)} ••${b.last4}`;
            return (
              <li
                key={b.id}
                className={cn(
                  "flex items-center gap-2 rounded-control border p-2 pl-4",
                  b.isActive
                    ? "on-ivory border-ivory bg-ivory text-chestnut"
                    : "border-dashed border-ivory/60 text-ivory",
                )}
              >
                {/* the account: tap to edit */}
                <button
                  type="button"
                  onClick={() => setOpen(b.id)}
                  className="min-w-0 flex-1 py-1.5 text-left"
                >
                  {/* as the Assets → Bank accounts card: the bank (with inactive), then its last digits and type */}
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="truncate font-heading text-xl font-bold leading-7"
                      title={name}
                    >
                      {bankName(b.bankName)}
                    </span>
                    {!b.isActive && (
                      <span className="shrink-0 rounded-control border border-current px-2 py-0.5 text-xs">
                        {tb("inactive")}
                      </span>
                    )}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs opacity-70">
                    <span className="tabular">••{b.last4}</span>
                    <span className="truncate">{tb(`form.types.${b.accountType}`)}</span>
                  </span>
                </button>

                {/* the pen: their details, where they can be made inactive (or active again) too */}
                <button
                  type="button"
                  onClick={() => setOpen(b.id)}
                  aria-label={tb("edit")}
                  className="grid size-11 shrink-0 place-items-center rounded-control hover:bg-chestnut/[0.08]"
                >
                  <Pencil className="size-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <BankSheet
        bankId={open}
        onClose={() => setOpen(null)}
        active={
          open && open !== "new"
            ? (() => {
                // gone from the list (inactive ones hidden): it was made inactive
                const b = (banks.data ?? []).find((x) => x.id === open);
                return {
                  on: b?.isActive ?? false,
                  onFlip: (on: boolean) => void toggleActive(open, b ? b.bankName : "", on),
                };
              })()
            : undefined
        }
      />
    </main>
  );
}

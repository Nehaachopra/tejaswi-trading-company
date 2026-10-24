"use client";

import { CircleAlert, Ellipsis, Pencil, Plus, Power, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Menu, MenuItem } from "~/components/ui/menu";
import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { cn } from "~/lib/utils";
import { titleCase } from "~/lib/format";
import { trpc } from "~/trpc/client";

import { BankSheet } from "../account/bank/bank-sheet";
import { chip } from "../product/row-styles";

// /entities/banks, admin only: where bank accounts are added, edited and made inactive (Accounts only shows their
// ledgers). + Add bank account, then a search (bank, branch, IFSC or account number) with Show inactive, both
// staying under the header, then a row per account: bank ••last 4 and type, branch and IFSC; tapping a row edits
// it, its ⋯ menu also marks it inactive or active
export function BanksManager() {
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
    (b) => needle === "" || [b.bankName, b.branchName, b.ifscCode ?? "", b.accountNumber, ...b.upiIds.map((u) => u.upiId)].some((v) => v.toLowerCase().includes(needle)),
  );

  // mark an account inactive (only at a zero balance) or active again
  async function toggleActive(id: string, name: string, makeActive: boolean) {
    try {
      await setActive.mutateAsync({ id, isActive: makeActive });
      toast.success(tb(makeActive ? "toast.reactivated" : "toast.deactivated", { name }));
      void utils.accounts.invalidate();
    } catch (err) {
      const code = (err as { data?: { code?: string } })?.data?.code;
      toast.error(tb(code === "PRECONDITION_FAILED" ? "errors.hasBalance" : code === undefined ? "errors.network" : "errors.failed"));
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      <h1 className="sr-only">{t("title")}</h1>

      <button
        type="button"
        onClick={() => setOpen("new")}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-ivory px-5 font-heading text-lg font-bold text-chestnut sm:w-auto"
      >
        <Plus className="size-5" aria-hidden /> {tb("add")}
      </button>

      {/* search and Show inactive, under the header while the list scrolls */}
      <div className="sticky top-16 z-20 -mx-4 mt-3 flex items-center gap-2 bg-chestnut px-4 py-2 sm:-mx-6 sm:px-6">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-control border border-ivory/40 px-3 focus-within:border-ivory">
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
        </label>
        <button type="button" aria-pressed={showInactive} onClick={() => setShowInactive((v) => !v)} className={chip(showInactive)}>
          {tb("showInactive")}
        </button>
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
        <ul className="mt-2 flex flex-col gap-3">
          {shown.map((b) => {
            const name = `${titleCase(b.bankName)} ••${b.last4}`;
            return (
              <li
                key={b.id}
                className={cn("flex items-center gap-2 rounded-control border p-2 pl-4", b.isActive ? "on-ivory border-ivory bg-ivory text-chestnut" : "border-dashed border-ivory/60 text-ivory")}
              >
                {/* the account: tap to edit */}
                <button type="button" onClick={() => setOpen(b.id)} className="min-w-0 flex-1 py-1.5 text-left">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-heading text-xl font-bold leading-7" title={name}>
                      {titleCase(b.bankName)}
                    </span>
                    <span className="tabular shrink-0 text-sm opacity-70">••{b.last4}</span>
                    {!b.isActive && <span className="shrink-0 rounded-control border border-current px-2 py-0.5 text-xs">{tb("inactive")}</span>}
                  </span>
                  <span className="block truncate text-sm">{tb(`form.types.${b.accountType}`)}</span>
                  <span className="tabular block truncate text-xs opacity-70">
                    {[titleCase(b.branchName), b.ifscCode].filter(Boolean).join(" · ")}
                  </span>
                </button>

                {/* edit, or mark inactive / active */}
                <Menu plain label={tb("menu")} surface={b.isActive ? "ivory" : "chestnut"} triggerClassName="size-11 shrink-0" trigger={<Ellipsis className="size-5" aria-hidden />}>
                  {(close) => (
                    <>
                      <MenuItem
                        onClick={() => {
                          close();
                          setOpen(b.id);
                        }}
                      >
                        <Pencil className="size-4" aria-hidden /> {tb("edit")}
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          close();
                          void toggleActive(b.id, name, !b.isActive);
                        }}
                      >
                        <Power className="size-4" aria-hidden /> {b.isActive ? tb("deactivate") : tb("reactivate")}
                      </MenuItem>
                    </>
                  )}
                </Menu>
              </li>
            );
          })}
        </ul>
      )}

      <BankSheet bankId={open} onClose={() => setOpen(null)} />
    </main>
  );
}

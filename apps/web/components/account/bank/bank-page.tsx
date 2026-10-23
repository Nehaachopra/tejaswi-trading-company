"use client";

import { ArrowLeft, CircleAlert, Ellipsis, Pencil, Power } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { Menu, MenuItem } from "~/components/ui/menu";
import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { rupees } from "~/lib/format";
import { trpc } from "~/trpc/client";

import { balanceText, postDatedText } from "../balance";
import { LedgerStatement } from "../ledger-statement";
import { BankSheet } from "./bank-sheet";

// /account/bank/[account], admin only: the account's details on top (Edit and Mark inactive in its ⋯ menu),
// its ledger below
export function BankPage({ bankId }: { bankId: string }) {
  const t = useTranslations("accounts.bank");
  const format = useFormatter();
  const utils = trpc.useUtils();
  const bank = trpc.accounts.bank.get.useQuery({ id: bankId });
  const setActive = trpc.accounts.bank.setActive.useMutation();
  const [editing, setEditing] = useState(false);

  // mark it inactive (only at a zero balance) or active again
  async function toggleActive(makeActive: boolean, name: string) {
    try {
      await setActive.mutateAsync({ id: bankId, isActive: makeActive });
      toast.success(t(makeActive ? "toast.reactivated" : "toast.deactivated", { name }));
      void utils.accounts.invalidate();
    } catch (err) {
      const code = (err as { data?: { code?: string } })?.data?.code;
      toast.error(t(code === "PRECONDITION_FAILED" ? "errors.hasBalance" : code === undefined ? "errors.network" : "errors.failed"));
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      {/* back to the list */}
      <Link href="/account/bank" className="inline-flex min-h-11 items-center gap-2 text-sm text-ivory/80 hover:text-ivory">
        <ArrowLeft className="size-4" aria-hidden /> {t("back")}
      </Link>

      {bank.isPending ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner /> {t("loading")}
        </p>
      ) : bank.isError ? (
        <p role="alert" className="mt-16 flex items-center justify-center gap-2">
          <CircleAlert className="size-4" aria-hidden /> {bank.error.data?.code === "NOT_FOUND" ? t("errors.gone") : t("loadError")}
        </p>
      ) : (
        (() => {
          const b = bank.data;
          const name = `${b.bankName} ••${b.last4}`;
          // money is still in it (or owed), now or post-dated
          const blocked = b.isActive && (b.balance.today.amount !== 0 || !!b.balance.postDated);
          const rows = [
            { label: t("details.accountNumber"), value: b.accountNumber, number: true },
            { label: t("details.ifsc"), value: b.ifscCode, number: true },
            { label: t("details.branch"), value: b.branchName },
            { label: t("details.type"), value: t(`form.types.${b.accountType}`) },
            { label: t("details.holder"), value: b.accountHolderName },
            { label: t("details.upi"), value: b.upiId ?? "—" },
            {
              label: t("details.opening"),
              value: b.openingBalance
                ? `${balanceText(b.openingBalance)} · ${format.dateTime(new Date(b.openingBalance.date), { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })} · ${b.openingBalance.assignedId}`
                : rupees(0),
            },
          ];

          return (
            <div className="mt-2 flex flex-col gap-4">
              {/* the details: name, balance, the ⋯ menu, then each detail */}
              <section className="on-ivory rounded-control bg-ivory text-chestnut">
                <header className="flex items-start gap-3 border-b border-chestnut/15 p-4">
                  <div className="min-w-0 flex-1">
                    <h1 className="flex items-center gap-2">
                      <span className="truncate font-heading text-2xl font-bold" title={b.bankName}>
                        {b.bankName}
                      </span>
                      <span className="tabular shrink-0 text-base text-chestnut/70">••{b.last4}</span>
                      {!b.isActive && <span className="shrink-0 rounded-control border border-current px-2 py-0.5 text-xs">{t("inactive")}</span>}
                    </h1>
                    <p className="tabular mt-1 font-heading text-3xl font-bold">{balanceText(b.balance.today)}</p>
                    {b.balance.postDated && <p className="tabular text-sm text-chestnut/70">{t("postDated", { amount: postDatedText(b.balance.postDated, "debit") })}</p>}
                  </div>
                  <Menu label={t("menu")} triggerClassName="size-11 shrink-0" trigger={<Ellipsis className="size-5" aria-hidden />}>
                    {(close) => (
                      <>
                        <MenuItem
                          onClick={() => {
                            close();
                            setEditing(true);
                          }}
                        >
                          <Pencil className="size-4" aria-hidden /> {t("edit")}
                        </MenuItem>
                        <MenuItem
                          disabled={blocked}
                          onClick={() => {
                            close();
                            void toggleActive(!b.isActive, name);
                          }}
                          className="flex-wrap"
                        >
                          <Power className="size-4" aria-hidden /> {b.isActive ? t("deactivate") : t("reactivate")}
                          {blocked && <span className="w-full pl-6 text-xs">{t("hasBalance")}</span>}
                        </MenuItem>
                      </>
                    )}
                  </Menu>
                </header>
                <dl className="grid grid-cols-1 divide-y divide-chestnut/10 px-4 sm:grid-cols-2 sm:gap-x-8 sm:divide-y-0">
                  {rows.map((row) => (
                    <div key={row.label} className="flex items-center justify-between gap-3 py-2.5 text-sm sm:border-b sm:border-chestnut/10">
                      <dt className="shrink-0 text-chestnut/70">{row.label}</dt>
                      <dd className={row.number ? "tabular min-w-0 truncate text-right font-medium" : "min-w-0 truncate text-right font-medium"} title={row.value}>
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>

              {/* its ledger */}
              <LedgerStatement ledgerId={b.ledgerId} name={name} balance={b.balance} />

              <BankSheet bankId={editing ? b.id : null} onClose={() => setEditing(false)} />
            </div>
          );
        })()
      )}
    </main>
  );
}

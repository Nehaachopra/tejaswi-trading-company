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

import { signed } from "../balance";
import { DetailRows, DetailsCard } from "../details-card";
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
                ? `${signed(b.openingBalance, "asset").text} · ${format.dateTime(new Date(b.openingBalance.date), { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })} · ${b.openingBalance.assignedId}`
                : rupees(0),
            },
          ];

          return (
            <div className="mt-2 flex flex-col gap-4">
              {/* the details: name and the ⋯ menu, opening to each detail */}
              <DetailsCard
                title={name}
                openLabel={t("showDetails")}
                tags={!b.isActive && <span className="shrink-0 rounded-control border border-current px-2 py-0.5 text-xs">{t("inactive")}</span>}
                menu={
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
                }
              >
                <DetailRows rows={rows} />
              </DetailsCard>

              {/* its ledger */}
              <LedgerStatement ledgerId={b.ledgerId} name={name} head="asset" balance={b.balance} />

              <BankSheet bankId={editing ? b.id : null} onClose={() => setEditing(false)} />
            </div>
          );
        })()
      )}
    </main>
  );
}

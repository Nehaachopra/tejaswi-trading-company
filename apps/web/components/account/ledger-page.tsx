"use client";

import { ArrowLeft, CircleAlert, Ellipsis, Pencil, Power } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Menu, MenuItem } from "~/components/ui/menu";
import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { trpc } from "~/trpc/client";

import { useLedgerName } from "./ledger-name";
import { LedgerSheet, type LedgerSheetFor } from "./ledger-sheet";
import { LedgerStatement } from "./ledger-statement";

// /account/ledgers/[id], admin only: one ledger's statement, under its name and today's balance
export function LedgerPage({ ledgerId }: { ledgerId: string }) {
  const t = useTranslations("accounts.overview");
  const ledger = trpc.accounts.ledger.get.useQuery({ id: ledgerId });
  const nameOf = useLedgerName();
  const tm = useTranslations("accounts.ledgerMenu");
  const utils = trpc.useUtils();
  const setActive = trpc.accounts.ledger.setActive.useMutation();
  const [sheet, setSheet] = useState<LedgerSheetFor | null>(null);

  // a ledger the admin added is made inactive only at a zero balance
  async function toggleActive(id: string, name: string, makeActive: boolean) {
    try {
      await setActive.mutateAsync({ id, isActive: makeActive });
      toast.success(tm(makeActive ? "toast.reactivated" : "toast.deactivated", { name }));
      void utils.accounts.invalidate();
    } catch (err) {
      const code = (err as { data?: { code?: string } })?.data?.code;
      toast.error(tm(code === "PRECONDITION_FAILED" ? "errors.hasBalance" : code === undefined ? "errors.network" : "errors.failed"));
    }
  }

  return (
    // little room below: the statement fills the screen and scrolls inside itself
    <main className="mx-auto max-w-5xl px-4 pb-6 pt-6 sm:px-6">
      {/* back to the ledger's head */}
      <Link href={ledger.data ? `/account/${ledger.data.head}` : "/account"} className="inline-flex min-h-11 items-center gap-2 text-sm text-ivory/80 hover:text-ivory">
        <ArrowLeft className="size-4" aria-hidden /> {ledger.data ? t(`heads.${ledger.data.head}`) : t("title")}
      </Link>

      {ledger.isPending ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner />
        </p>
      ) : ledger.isError ? (
        <p role="alert" className="mt-16 flex items-center justify-center gap-2">
          <CircleAlert className="size-4" aria-hidden /> {t("loadError")}
        </p>
      ) : (
        <div className="mt-2">
          <h1 className="sr-only">{nameOf(ledger.data)}</h1>
          <LedgerStatement
            ledgerId={ledgerId}
            name={nameOf(ledger.data)}
            head={ledger.data.head}
            balance={ledger.data.balance}
            // a ledger the admin added can be renamed or made inactive; its opening balance, like every other, is set
            // on the Opening balances page
            menu={
              ledger.data.custom && (
                <Menu plain label={tm("label")} triggerClassName="size-10 shrink-0" trigger={<Ellipsis className="size-5" aria-hidden />}>
                  {(close) => (
                    <>
                      <MenuItem
                        onClick={() => {
                          close();
                          setSheet({ kind: "rename", id: ledger.data.id, head: ledger.data.head, name: ledger.data.name });
                        }}
                      >
                        <Pencil className="size-4" aria-hidden /> {tm("rename")}
                      </MenuItem>
                      <MenuItem
                        disabled={ledger.data.isActive && (ledger.data.balance.today.amount !== 0 || !!ledger.data.balance.postDated)}
                        onClick={() => {
                          close();
                          void toggleActive(ledger.data.id, ledger.data.name, !ledger.data.isActive);
                        }}
                        className="flex-wrap"
                      >
                        <Power className="size-4" aria-hidden /> {tm(ledger.data.isActive ? "deactivate" : "reactivate")}
                        {ledger.data.isActive && (ledger.data.balance.today.amount !== 0 || !!ledger.data.balance.postDated) && (
                          <span className="w-full pl-6 text-xs">{tm("hasBalance")}</span>
                        )}
                      </MenuItem>
                    </>
                  )}
                </Menu>
              )
            }
          />
          <LedgerSheet open={sheet} onClose={() => setSheet(null)} />
        </div>
      )}
    </main>
  );
}

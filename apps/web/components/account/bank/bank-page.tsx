"use client";

import { ArrowLeft, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Spinner } from "~/components/ui/spinner";
import { titleCase } from "~/lib/format";
import { trpc } from "~/trpc/client";

import { DetailRows, DetailsCard } from "../details-card";
import { LedgerStatement } from "../ledger-statement";

// /account/bank/[account], admin only and view only: the account's details on top, its ledger below (it is
// added, edited and made inactive in Entities → Bank accounts)
export function BankPage({ bankId }: { bankId: string }) {
  const t = useTranslations("accounts.bank");
  const tf = useTranslations("accounts.bank.form");
  const bank = trpc.accounts.bank.get.useQuery({ id: bankId });

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
          const name = `${titleCase(b.bankName)} ••${b.last4}`;
          const rows = [
            { label: t("details.accountNumber"), value: b.accountNumber, number: true },
            { label: t("details.ifsc"), value: b.ifscCode ?? "—", number: true },
            { label: t("details.branch"), value: titleCase(b.branchName) },
            { label: t("details.type"), value: t(`form.types.${b.accountType}`) },
            { label: t("details.holder"), value: titleCase(b.accountHolderName) },
            // each UPI ID with the app it's in
            { label: t("details.upi"), value: b.upiIds.length ? b.upiIds.map((u) => `${u.upiId} (${tf(`providers.${u.provider}`)})`).join(", ") : "—" },
          ];

          return (
            <div className="mt-2 flex flex-col gap-4">
              {/* the details: name and the ⋯ menu, opening to each detail */}
              <DetailsCard
                title={name}
                openLabel={t("showDetails")}
                tags={!b.isActive && <span className="shrink-0 rounded-control border border-current px-2 py-0.5 text-xs">{t("inactive")}</span>}
              >
                <DetailRows rows={rows} />
              </DetailsCard>

              {/* its ledger, titled with the account's name (the header above carries the bank and ••last 4) */}
              <LedgerStatement ledgerId={b.ledgerId} name={b.accountHolderName} head="asset" balance={b.balance} />

            </div>
          );
        })()
      )}
    </main>
  );
}

"use client";

import { ArrowLeft, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Spinner } from "~/components/ui/spinner";
import { trpc } from "~/trpc/client";

import { DetailRows, DetailsCard } from "../details-card";
import { LedgerStatement } from "../ledger-statement";
import { kindOf, PARTY_KINDS, partyLabel, type PartyType } from "./party-kinds";

// a party's page in Accounts, admin only and view only: its details (opening to its addresses), its insights, then
// its ledger. Parties are added, edited and made inactive in Parties
export function PartyPage({ partyId, type }: { partyId: string; type: PartyType }) {
  const t = useTranslations("accounts.party");
  const tf = useTranslations("accounts.party.form");
  const party = trpc.accounts.party.get.useQuery({ id: partyId });
  const list = party.data ? kindOf(party.data.type) : type;
  const kind = PARTY_KINDS[list];

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      {/* back to its list */}
      <Link href={kind.path} className="inline-flex min-h-11 items-center gap-2 text-sm text-ivory/80 hover:text-ivory">
        <ArrowLeft className="size-4" aria-hidden /> {t(`titles.${list}`)}
      </Link>

      {party.isPending ? (
        <p className="mt-16 flex items-center justify-center gap-2 text-ivory/70">
          <Spinner />
        </p>
      ) : party.isError ? (
        <p role="alert" className="mt-16 flex items-center justify-center gap-2">
          <CircleAlert className="size-4" aria-hidden /> {party.error.data?.code === "NOT_FOUND" ? t("errors.gone") : t("loadError")}
        </p>
      ) : (
        (() => {
          const p = party.data;
          // how it deals with us; a supplier's settling time is how long we take to pay it
          const insights = [
            { label: t("insights.transactions"), value: p.insights.transactions.toLocaleString("en-IN") },
            { label: t("insights.pendingOrders"), value: p.insights.pendingOrders.toLocaleString("en-IN") },
            {
              label: t(p.type === "supplier" ? "insights.paymentTime" : "insights.collectionTime"),
              value: p.insights.averageDays === null ? "—" : t("insights.days", { count: p.insights.averageDays }),
            },
            { label: t("insights.perMonth"), value: p.insights.perMonth.toLocaleString("en-IN") },
          ];
          const rows = [
            { label: t("details.name"), value: p.name },
            { label: t("details.type"), value: tf(`types.${kindOf(p.type)}`) },
            { label: t("details.phone"), value: p.phone ? `${p.countryCode} ${p.phone}` : "—", number: true },
            { label: t("details.email"), value: p.email ?? "—" },
            { label: t("details.pan"), value: p.pan ?? "—", number: true },
          ];

          return (
            <div className="mt-2 flex flex-col gap-4">
              {/* the details: short name, opening to each detail (the full name first) and its addresses; it is edited in
                  Parties */}
              <DetailsCard
                title={partyLabel(p)}
                openLabel={t("showDetails")}
                tags={!p.isActive && <span className="shrink-0 rounded-control border border-current px-2 py-0.5 text-xs">{t("inactive")}</span>}
              >
                <DetailRows rows={rows} />

                {/* its addresses, the default first */}
                {p.addresses.length > 0 && (
                  <ul className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
                    {[...p.addresses]
                      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
                      .map((a) => (
                        <li key={a.id} className="rounded-control border border-chestnut/20 p-3 text-sm">
                          <p className="mb-1 flex items-center gap-2 text-xs text-chestnut/70">
                            <span className="truncate">{a.label ?? tf(`uses.${a.addressType}`)}</span>
                            {a.isDefault && <span className="shrink-0 rounded-control bg-chestnut px-1.5 py-0.5 text-[0.7rem] font-medium text-ivory">{tf("isDefault")}</span>}
                          </p>
                          <p className="break-words">{[a.addressLine1, a.addressLine2, a.landmark].filter(Boolean).join(", ")}</p>
                          <p className="break-words">
                            {a.city}, {a.district}, {a.state} {a.postalCode}
                          </p>
                          {a.gstin && (
                            <p className="tabular mt-2 inline-flex rounded-control bg-chestnut px-2 py-0.5 text-xs font-semibold tracking-wide text-ivory">GSTIN {a.gstin}</p>
                          )}
                        </li>
                      ))}
                  </ul>
                )}
              </DetailsCard>

              {/* insights: how it deals with us, always in view under the details */}
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {insights.map((i) => (
                  <div key={i.label} className="on-ivory rounded-control bg-ivory p-3 text-chestnut">
                    <dt className="text-xs text-chestnut/70">{i.label}</dt>
                    <dd className="tabular mt-1 font-heading text-2xl font-bold">{i.value}</dd>
                  </div>
                ))}
              </dl>

              {/* its ledger */}
              <LedgerStatement ledgerId={p.ledgerId} name={partyLabel(p)} head={kind.head} balance={p.balance} />

            </div>
          );
        })()
      )}
    </main>
  );
}

import type { Metadata } from "next";

import { PartyPage } from "~/components/account/party/party-page";

export const metadata: Metadata = { title: "Debtor-creditor · Tejaswi trading company" };

// one party who is both customer and supplier: details on top, its one ledger below; the layout already checked
// for an admin session
export default async function DebtorCreditorPage({ params }: { params: Promise<{ party: string }> }) {
  const { party } = await params;
  return <PartyPage partyId={party} type="both" />;
}

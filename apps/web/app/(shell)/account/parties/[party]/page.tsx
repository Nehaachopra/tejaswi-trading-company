import type { Metadata } from "next";

import { PartyPage } from "~/components/account/party/party-page";

export const metadata: Metadata = { title: "Party · Tejaswi trading company" };

// one party with no sale or purchase yet: details on top, its ledger below; the layout already checked for an admin
// session
export default async function PartyLedgerPage({ params }: { params: Promise<{ party: string }> }) {
  const { party } = await params;
  return <PartyPage partyId={party} type="none" />;
}

import type { Metadata } from "next";

import { PartyPage } from "~/components/account/party/party-page";

export const metadata: Metadata = { title: "Debtor · Tejaswi trading company" };

// one customer: details on top, its ledger below; the layout already checked for an admin session
export default async function DebtorPage({ params }: { params: Promise<{ party: string }> }) {
  const { party } = await params;
  return <PartyPage partyId={party} type="customer" />;
}

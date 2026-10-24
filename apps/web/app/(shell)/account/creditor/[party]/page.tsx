import type { Metadata } from "next";

import { PartyPage } from "~/components/account/party/party-page";

export const metadata: Metadata = { title: "Creditor · Tejaswi trading company" };

// one supplier: details on top, its ledger below; the layout already checked for an admin session
export default async function CreditorPage({ params }: { params: Promise<{ party: string }> }) {
  const { party } = await params;
  return <PartyPage partyId={party} type="supplier" />;
}

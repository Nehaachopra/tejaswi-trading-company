import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DUE_KINDS, type DueKind } from "~/components/dues/due-kinds";
import { PartyDues } from "~/components/dues/party-dues";

export const metadata: Metadata = { title: "Dues · Tejaswi trading company" };

// one party's dues of one kind; the layout already checked for an admin session
export default async function PartyDuesPage({ params }: { params: Promise<{ kind: string; party: string }> }) {
  const { kind, party } = await params;
  if (!DUE_KINDS.includes(kind as DueKind)) notFound();
  return <PartyDues kind={kind as DueKind} partyId={party} />;
}

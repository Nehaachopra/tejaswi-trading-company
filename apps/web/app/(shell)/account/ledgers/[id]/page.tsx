import type { Metadata } from "next";

import { LedgerPage } from "~/components/account/ledger-page";

export const metadata: Metadata = { title: "Ledger · Tejaswi trading company" };

// one ledger and its statement; the layout already checked for an admin session
export default async function LedgerStatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LedgerPage ledgerId={id} />;
}

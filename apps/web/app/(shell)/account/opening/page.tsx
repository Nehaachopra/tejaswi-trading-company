import type { Metadata } from "next";

import { OpeningBoard } from "~/components/account/opening-board";

export const metadata: Metadata = { title: "Opening balances · Tejaswi trading company" };

// every ledger's opening balance on one page; the layout already checked for an admin session
export default function OpeningBalancesPage() {
  return <OpeningBoard />;
}

import type { Metadata } from "next";

import { PartiesBoard } from "~/components/account/party/parties-board";

export const metadata: Metadata = { title: "Debtor-creditors · Tejaswi trading company" };

// parties who are both customer and supplier; the layout already checked for an admin session
export default function DebtorCreditorsPage() {
  return <PartiesBoard type="both" />;
}

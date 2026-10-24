import type { Metadata } from "next";

import { PartiesBoard } from "~/components/account/party/parties-board";

export const metadata: Metadata = { title: "Debtors · Tejaswi trading company" };

// customers; the layout already checked for an admin session
export default function DebtorsPage() {
  return <PartiesBoard type="customer" />;
}

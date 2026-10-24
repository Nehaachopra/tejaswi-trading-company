import type { Metadata } from "next";

import { PartiesBoard } from "~/components/account/party/parties-board";

export const metadata: Metadata = { title: "Creditors · Tejaswi trading company" };

// suppliers; the layout already checked for an admin session
export default function CreditorsPage() {
  return <PartiesBoard type="supplier" />;
}

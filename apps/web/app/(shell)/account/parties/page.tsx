import type { Metadata } from "next";

import { PartiesBoard } from "~/components/account/party/parties-board";

export const metadata: Metadata = { title: "Parties · Tejaswi trading company" };

// parties with no sale or purchase yet; the layout already checked for an admin session
export default function PartiesPage() {
  return <PartiesBoard type="none" />;
}

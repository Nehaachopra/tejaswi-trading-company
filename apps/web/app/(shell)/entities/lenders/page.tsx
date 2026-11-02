import type { Metadata } from "next";

import { LendersManager } from "~/components/entities/lenders-manager";

export const metadata: Metadata = { title: "Lenders · Tejaswi trading company" };

// banks and NBFCs, apart from parties; the layout already checked for an admin session
export default function LendersPage() {
  return <LendersManager />;
}

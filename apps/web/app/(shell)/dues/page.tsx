import type { Metadata } from "next";

import { DUE_KINDS, type DueKind } from "~/components/dues/due-kinds";
import { DuesBoard } from "~/components/dues/dues-board";

export const metadata: Metadata = { title: "Dues · Tejaswi trading company" };

// what's owed both ways, on the tab in the link (Debtors when none); the layout already checked for an admin session
export default async function DuesPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  return <DuesBoard initialKind={DUE_KINDS.includes(kind as DueKind) ? (kind as DueKind) : "debtor"} />;
}

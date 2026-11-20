import type { Metadata } from "next";

import { HistoryDetail } from "~/components/history/history-detail";
import { getSession } from "~/lib/session";

export const metadata: Metadata = { title: "Transaction · Tejaswi trading company" };

// one past transaction; staff only their own (the server decides), the admin may cancel it
export default async function HistoryTransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  return <HistoryDetail id={id} isAdmin={session!.user.role === "admin"} />;
}

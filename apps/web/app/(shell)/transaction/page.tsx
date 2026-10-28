import type { Metadata } from "next";

import { TransactionHub } from "~/components/transaction/transaction-hub";
import { getSession } from "~/trpc/session";

export const metadata: Metadata = { title: "New transaction · Tejaswi trading company" };

// every kind of transaction to make; admin and staff (the shell already checked for a session)
export default async function TransactionPage() {
  const session = await getSession();
  return <TransactionHub isAdmin={session!.user.role === "admin"} />;
}

import type { Metadata } from "next";

import { ContraForm } from "~/components/transaction/contra/form";
import { getSession } from "~/trpc/session";

export const metadata: Metadata = { title: "Deposit · Tejaswi trading company" };

// cash put into a bank account, as a form like the receipt's; admin and staff (balances are the admin's)
export default async function DepositPage() {
  const session = await getSession();
  return <ContraForm kind="deposit" isAdmin={session!.user.role === "admin"} />;
}

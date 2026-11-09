import type { Metadata } from "next";

import { ContraForm } from "~/components/transaction/contra/form";
import { getSession } from "~/trpc/session";

export const metadata: Metadata = { title: "Withdrawal · Tejaswi trading company" };

// cash taken out of a bank account, as a form like the receipt's; admin and staff (balances are the admin's)
export default async function WithdrawalPage() {
  const session = await getSession();
  return <ContraForm kind="withdrawal" isAdmin={session!.user.role === "admin"} />;
}

import type { Metadata } from "next";

import { ContraForm } from "~/components/transaction/contra/form";
import { getSession } from "~/trpc/session";

export const metadata: Metadata = { title: "Transfer · Tejaswi trading company" };

// money moved from one bank account to another, as a form like the receipt's; admin and staff (balances are the admin's)
export default async function TransferPage() {
  const session = await getSession();
  return <ContraForm kind="transfer" isAdmin={session!.user.role === "admin"} />;
}

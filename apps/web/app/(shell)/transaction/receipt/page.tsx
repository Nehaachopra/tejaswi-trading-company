import type { Metadata } from "next";

import { ReceiptForm } from "~/components/transaction/receipt-form";
import { getSession } from "~/trpc/session";

export const metadata: Metadata = { title: "Receipt · Tejaswi trading company" };

// money coming in, as a form like the payment's; admin and staff (balances and new ledgers are the admin's)
export default async function ReceiptPage() {
  const session = await getSession();
  return <ReceiptForm isAdmin={session!.user.role === "admin"} />;
}

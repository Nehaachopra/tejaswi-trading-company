import type { Metadata } from "next";

import { PaymentChat } from "~/components/transaction/chat/receipt-chat";
import { getSession } from "~/trpc/session";

export const metadata: Metadata = { title: "Payment · Tejaswi trading company" };

// money going out, as a chat; admin and staff (balances and new ledgers are the admin's)
export default async function PaymentPage() {
  const session = await getSession();
  return <PaymentChat isAdmin={session!.user.role === "admin"} />;
}

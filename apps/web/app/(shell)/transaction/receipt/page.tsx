import type { Metadata } from "next";

import { ReceiptChat } from "~/components/transaction/chat/receipt-chat";
import { getSession } from "~/trpc/session";

export const metadata: Metadata = { title: "Receipt · Tejaswi trading company" };

// money coming in, as a chat; admin and staff (balances and new ledgers are the admin's)
export default async function ReceiptPage() {
  const session = await getSession();
  return <ReceiptChat isAdmin={session!.user.role === "admin"} />;
}

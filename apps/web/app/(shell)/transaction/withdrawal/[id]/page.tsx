import type { Metadata } from "next";

import { ReceiptSuccess } from "~/components/transaction/done/success";

export const metadata: Metadata = { title: "Withdrawal created · Tejaswi trading company" };

// where a saved withdrawal lands, as a receipt's does: that it worked, its number, and what the account and cash hold
// now (the admin's). Admin and staff
export default async function WithdrawalDonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReceiptSuccess id={id} flow="withdrawal" />;
}

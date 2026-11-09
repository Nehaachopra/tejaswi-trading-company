import type { Metadata } from "next";

import { ReceiptSuccess } from "~/components/transaction/done/success";

export const metadata: Metadata = { title: "Deposit created · Tejaswi trading company" };

// where a saved deposit lands, as a receipt's does: that it worked, its number, and what cash and the account hold now
// (the admin's). Admin and staff
export default async function DepositDonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReceiptSuccess id={id} flow="deposit" />;
}

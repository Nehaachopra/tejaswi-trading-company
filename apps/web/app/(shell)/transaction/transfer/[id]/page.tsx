import type { Metadata } from "next";

import { ReceiptSuccess } from "~/components/transaction/done/success";

export const metadata: Metadata = { title: "Transfer created · Tejaswi trading company" };

// where a saved transfer lands, as a receipt's does: that it worked, its number, and what the two accounts hold
// now (the admin's). Admin and staff
export default async function TransferDonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReceiptSuccess id={id} flow="transfer" />;
}

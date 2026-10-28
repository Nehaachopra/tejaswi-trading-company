import type { Metadata } from "next";

import { ReceiptSuccess } from "~/components/transaction/receipt-success";

export const metadata: Metadata = { title: "Receipt created · Tejaswi trading company" };

// where a saved receipt lands: that it worked, its number and voucher, and the balances it moved (the admin's);
// the voucher's back link returns here. Admin and staff
export default async function ReceiptDonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReceiptSuccess id={id} />;
}

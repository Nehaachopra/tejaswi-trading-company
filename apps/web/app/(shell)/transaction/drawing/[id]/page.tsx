import type { Metadata } from "next";

import { ReceiptSuccess } from "~/components/transaction/done/success";

export const metadata: Metadata = { title: "Drawing created · Tejaswi trading company" };

// where a saved drawing lands, as a receipt's does: that it worked, its number, and what the cash or bank account it
// came out of holds now (money), or its cost and the GST reversed (goods). The admin's
export default async function DrawingDonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReceiptSuccess id={id} flow="drawing" />;
}

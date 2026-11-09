import type { Metadata } from "next";

import { ReceiptSuccess } from "~/components/transaction/done/success";

export const metadata: Metadata = { title: "Entry created · Tejaswi trading company" };

// where a saved journal entry lands, as a receipt's does: that it worked and its number. The admin's
export default async function OtherDonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReceiptSuccess id={id} flow="other" />;
}

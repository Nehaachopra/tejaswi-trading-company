import type { Metadata } from "next";

import { ReceiptVoucher } from "~/components/transaction/receipt-voucher";

export const metadata: Metadata = { title: "Receipt voucher · Tejaswi trading company" };

// a receipt's voucher, to print or save as a PDF; admin and staff
export default async function ReceiptVoucherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReceiptVoucher id={id} />;
}

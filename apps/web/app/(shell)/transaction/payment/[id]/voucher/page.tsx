import type { Metadata } from "next";

import { ReceiptVoucher } from "~/components/transaction/receipt-voucher";

export const metadata: Metadata = { title: "Payment voucher · Tejaswi trading company" };

// a payment's voucher, to print or save as a PDF; admin and staff
export default async function PaymentVoucherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReceiptVoucher id={id} flow="payment" />;
}

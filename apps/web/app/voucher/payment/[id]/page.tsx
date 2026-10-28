import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReceiptVoucher } from "~/components/transaction/receipt-voucher";

export const metadata: Metadata = { title: "Payment voucher · Tejaswi trading company", robots: { index: false } };

// a payment's voucher sent to the party on WhatsApp: opens without a login, only with the key in its link
export default async function SharedPaymentVoucherPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const [{ id }, { k }] = await Promise.all([params, searchParams]);
  if (!k) notFound();
  return (
    <div className="min-h-dvh bg-chestnut text-ivory">
      <ReceiptVoucher id={id} shareKey={k} flow="payment" />
    </div>
  );
}

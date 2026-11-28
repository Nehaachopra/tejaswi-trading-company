import type { Metadata } from "next";

import { SalaryVoucher } from "~/components/transaction/payment/salary/voucher";

export const metadata: Metadata = { title: "Payment voucher · Tejaswi trading company" };

// a salary's or advance's voucher, as a payment's: to print or save as a PDF
export default async function SalaryVoucherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SalaryVoucher id={id} />;
}

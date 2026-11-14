import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SaleInvoice } from "~/components/transaction/sale/invoice";

export const metadata: Metadata = { title: "Tax invoice · Tejaswi trading company", robots: { index: false } };

// a sale's invoice sent to the customer on WhatsApp: opens without a login, only with the key in its link
export default async function SharedSaleInvoicePage({
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
      <SaleInvoice id={id} shareKey={k} />
    </div>
  );
}

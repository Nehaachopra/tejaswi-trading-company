import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PurchaseOrderDocument } from "~/components/transaction/order/document";

export const metadata: Metadata = { title: "Purchase order · Tejaswi trading company", robots: { index: false } };

// a purchase order sent to the supplier on WhatsApp: opens without a login, only with the key in its link
export default async function SharedPurchaseOrderPage({
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
      <PurchaseOrderDocument id={id} shareKey={k} />
    </div>
  );
}

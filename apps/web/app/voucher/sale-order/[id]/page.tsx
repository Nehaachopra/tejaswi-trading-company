import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OrderDocument } from "~/components/transaction/order/document";

export const metadata: Metadata = { title: "Sale order · Tejaswi trading company", robots: { index: false } };

// a sale order sent to the customer on WhatsApp: opens without a login, only with the key in its link
export default async function SharedSaleOrderPage({
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
      <OrderDocument kind="sale" id={id} shareKey={k} />
    </div>
  );
}

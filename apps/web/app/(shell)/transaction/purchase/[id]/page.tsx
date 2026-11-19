import type { Metadata } from "next";

import { PurchaseSuccess } from "~/components/transaction/purchase/success";

export const metadata: Metadata = { title: "Purchase saved · Tejaswi trading company" };

// where a saved purchase lands: that it worked, its number, items, total, payment and the bill. Admin and staff
export default async function PurchaseDonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PurchaseSuccess id={id} />;
}

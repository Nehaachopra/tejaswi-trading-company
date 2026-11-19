import type { Metadata } from "next";

import { PurchaseForm } from "~/components/transaction/purchase/form";
import { getSession } from "~/lib/session";

export const metadata: Metadata = { title: "Purchase · Tejaswi trading company" };

// goods coming in from a supplier, for cash or on credit, as a form one card at a time; admin and staff (adding a
// supplier or a product is the admin's). ?order= (from a purchase order's Record arrival): the purchase is an arrival on
// that order
export default async function PurchasePage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const session = await getSession();
  const { order } = await searchParams;
  return <PurchaseForm isAdmin={session!.user.role === "admin"} orderId={order ?? null} />;
}

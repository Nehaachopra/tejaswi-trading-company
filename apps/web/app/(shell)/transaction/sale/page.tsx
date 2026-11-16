import type { Metadata } from "next";

import { SaleForm } from "~/components/transaction/sale/form";
import { getSession } from "~/lib/session";

export const metadata: Metadata = { title: "Sale · Tejaswi trading company" };

// goods going out for cash or on credit, as a form one card at a time; admin and staff (adding a customer is the admin's).
// ?order= (from a sale order's Record dispatch): the sale is a dispatch on that order
export default async function SalePage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const session = await getSession();
  const { order } = await searchParams;
  return <SaleForm isAdmin={session!.user.role === "admin"} orderId={order ?? null} />;
}

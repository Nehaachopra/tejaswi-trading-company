import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OrderForm } from "~/components/transaction/order/new/form";
import { getSession } from "~/lib/session";

export const metadata: Metadata = { title: "New purchase order · Tejaswi trading company" };

// a new purchase order, as a form like the payment's; the admin's only (staff go back to the list of transactions)
export default async function NewPurchaseOrderPage() {
  const session = await getSession();
  if (session!.user.role !== "admin") redirect("/transaction");
  return <OrderForm kind="purchase" isAdmin />;
}

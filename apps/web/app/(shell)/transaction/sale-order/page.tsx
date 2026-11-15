import type { Metadata } from "next";

import { OrderForm } from "~/components/transaction/order/new/form";
import { getSession } from "~/lib/session";

export const metadata: Metadata = { title: "New sale order · Tejaswi trading company" };

// a new sale order, as a form like the payment's; the admin's and staff's
export default async function NewSaleOrderPage() {
  const session = await getSession();
  return <OrderForm kind="sale" isAdmin={session!.user.role === "admin"} />;
}

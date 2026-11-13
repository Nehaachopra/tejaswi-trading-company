import type { Metadata } from "next";

import { OrderForm } from "~/components/transaction/order/new/form";
import { getSession } from "~/trpc/session";

export const metadata: Metadata = { title: "New order · Tejaswi trading company" };

// a new order, as a form like the payment's: the admin takes purchase and sale orders, staff sale orders only
export default async function NewOrderPage() {
  const session = await getSession();
  return <OrderForm isAdmin={session!.user.role === "admin"} />;
}

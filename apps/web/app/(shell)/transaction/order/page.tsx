import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OrderForm } from "~/components/transaction/order/new/form";
import { getSession } from "~/trpc/session";

export const metadata: Metadata = { title: "New order · Tejaswi trading company" };

// a new order, as a form like the payment's; the admin's only (staff go back Home)
export default async function NewOrderPage() {
  const session = await getSession();
  if (session!.user.role !== "admin") redirect("/");
  return <OrderForm />;
}

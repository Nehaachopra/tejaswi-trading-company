import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { OrderPage } from "~/components/orders/order-page";
import { getSession } from "~/trpc/session";

export const metadata: Metadata = { title: "Order · Tejaswi trading company" };

// one order, opened from the Orders page: purchase orders are the admin's, sale orders admin and staff
export default async function OrderDetailPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (kind !== "purchase" && kind !== "sale") notFound();
  const session = await getSession();
  const isAdmin = session!.user.role === "admin";
  if (kind === "purchase" && !isAdmin) redirect("/order");
  return <OrderPage kind={kind} id={id} isAdmin={isAdmin} />;
}

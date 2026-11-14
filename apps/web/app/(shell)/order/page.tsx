import type { Metadata } from "next";

import { OrdersBoard } from "~/components/orders/board";
import { getSession } from "~/trpc/session";

export const metadata: Metadata = { title: "Orders · Tejaswi trading company" };

// Orders: the orders taken (new ones are made from Home, like a transaction). `?kind=purchase` opens the Purchase tab
// (the admin's), as when coming back from a purchase order; otherwise Sale
export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const session = await getSession();
  const isAdmin = session!.user.role === "admin";
  return <OrdersBoard isAdmin={isAdmin} initialKind={kind === "purchase" && isAdmin ? "purchase" : "sale"} />;
}

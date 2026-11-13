import type { Metadata } from "next";

import { OrdersBoard } from "~/components/orders/board";
import { getSession } from "~/trpc/session";

export const metadata: Metadata = { title: "Orders · Tejaswi trading company" };

// Orders: the orders taken (new ones are made from Home, like a transaction)
export default async function OrdersPage() {
  const session = await getSession();
  return <OrdersBoard isAdmin={session!.user.role === "admin"} />;
}

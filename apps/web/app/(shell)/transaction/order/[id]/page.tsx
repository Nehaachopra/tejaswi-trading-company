import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PurchaseOrderDone } from "~/components/transaction/order/done";
import { getSession } from "~/trpc/session";

export const metadata: Metadata = { title: "Order saved · Tejaswi trading company" };

// where a saved purchase order lands: that it worked, its number and what it is. The admin's
export default async function PurchaseOrderDonePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session!.user.role !== "admin") redirect("/");
  const { id } = await params;
  return <PurchaseOrderDone id={id} />;
}

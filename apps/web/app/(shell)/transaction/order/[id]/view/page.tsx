import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PurchaseOrderDocument } from "~/components/transaction/order/document";
import { getSession } from "~/trpc/session";

export const metadata: Metadata = { title: "Purchase order · Tejaswi trading company" };

// a purchase order as a document, to print or save as a PDF and share with the supplier; the admin's
export default async function PurchaseOrderViewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session!.user.role !== "admin") redirect("/");
  const { id } = await params;
  return <PurchaseOrderDocument id={id} />;
}

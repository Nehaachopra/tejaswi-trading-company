import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PurchaseReturnSuccess } from "~/components/transaction/purchase-return/success";
import { getSession } from "~/lib/session";

export const metadata: Metadata = { title: "Purchase return saved · Tejaswi trading company" };

// where a saved purchase return lands: that it worked, its number, the debit note, the items and total (the admin's)
export default async function PurchaseReturnDonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (session!.user.role !== "admin") redirect("/history");
  return <PurchaseReturnSuccess id={id} />;
}

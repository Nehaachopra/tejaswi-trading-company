import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ReturnForm } from "~/components/transaction/sale-return/form";
import { getSession } from "~/lib/session";

export const metadata: Metadata = { title: "Sale return · Tejaswi trading company" };

// a sale return from History (the sale's Return button): the admin's only (staff go back to the sale)
export default async function SaleReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (session!.user.role !== "admin") redirect(`/history/${id}`);
  return <ReturnForm id={id} />;
}

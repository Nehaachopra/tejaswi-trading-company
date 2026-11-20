import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SaleForm } from "~/components/transaction/sale/form";
import { getSession } from "~/lib/session";

export const metadata: Metadata = { title: "Edit sale · Tejaswi trading company" };

// editing a sale from History: the sale form opened as it was saved; the admin's only (staff go back to it)
export default async function EditSalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (session!.user.role !== "admin") redirect(`/history/${id}`);
  return <SaleForm isAdmin editId={id} />;
}

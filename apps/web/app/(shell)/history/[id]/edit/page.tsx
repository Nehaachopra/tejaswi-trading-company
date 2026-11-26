import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EditRoute } from "~/components/history/edit-route";
import { getSession } from "~/lib/session";

export const metadata: Metadata = { title: "Edit · Tejaswi trading company" };

// editing a sale or a purchase from History; the admin's only (staff go back to it)
export default async function EditSalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (session!.user.role !== "admin") redirect(`/history/${id}`);
  return <EditRoute id={id} />;
}

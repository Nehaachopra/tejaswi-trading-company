import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ReplacementForm } from "~/components/transaction/replacement/form";
import { getSession } from "~/lib/session";

export const metadata: Metadata = { title: "Record replacement · Tejaswi trading company" };

// recording a purchase return's replaced packs that came back on the supplier's invoice; the admin's only (staff go
// back to the return)
export default async function ReplacementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (session!.user.role !== "admin") redirect(`/history/${id}`);
  return <ReplacementForm id={id} />;
}

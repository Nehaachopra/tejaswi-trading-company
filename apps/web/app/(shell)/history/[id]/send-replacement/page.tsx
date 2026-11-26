import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SendReplacementForm } from "~/components/transaction/send-replacement/form";
import { getSession } from "~/lib/session";

export const metadata: Metadata = { title: "Send replacement · Tejaswi trading company" };

// sending a sale return's packs replaced later to the customer (a sale); the admin's only (staff go back to the return)
export default async function SendReplacementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (session!.user.role !== "admin") redirect(`/history/${id}`);
  return <SendReplacementForm id={id} />;
}

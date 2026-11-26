import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ReturnRoute } from "~/components/history/return-route";
import { getSession } from "~/lib/session";

export const metadata: Metadata = { title: "Return · Tejaswi trading company" };

// a sale's or a purchase's return from History (its Return button): the admin's only (staff go back to it)
export default async function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (session!.user.role !== "admin") redirect(`/history/${id}`);
  return <ReturnRoute id={id} />;
}

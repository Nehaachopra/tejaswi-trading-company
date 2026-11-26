import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DebitNoteView } from "~/components/transaction/purchase-return/debit-note";
import { getSession } from "~/lib/session";

export const metadata: Metadata = { title: "Debit note · Tejaswi trading company" };

// a purchase return's debit note, to print or save as a PDF (the admin's)
export default async function DebitNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (session!.user.role !== "admin") redirect("/history");
  return <DebitNoteView id={id} />;
}

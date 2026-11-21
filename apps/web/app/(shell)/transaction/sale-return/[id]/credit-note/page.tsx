import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CreditNoteView } from "~/components/transaction/sale-return/credit-note";
import { getSession } from "~/lib/session";

export const metadata: Metadata = { title: "Credit note · Tejaswi trading company" };

// a sale return's credit note, to print or save as a PDF (the admin's)
export default async function CreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (session!.user.role !== "admin") redirect("/history");
  return <CreditNoteView id={id} />;
}

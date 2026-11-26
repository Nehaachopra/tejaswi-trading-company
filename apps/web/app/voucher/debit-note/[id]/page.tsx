import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DebitNoteView } from "~/components/transaction/purchase-return/debit-note";

export const metadata: Metadata = { title: "Debit note · Tejaswi trading company", robots: { index: false } };

// a return's debit note sent to the supplier on WhatsApp: opens without a login, only with the key in its link
export default async function SharedDebitNotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const [{ id }, { k }] = await Promise.all([params, searchParams]);
  if (!k) notFound();
  return (
    <div className="min-h-dvh bg-chestnut text-ivory">
      <DebitNoteView id={id} shareKey={k} />
    </div>
  );
}

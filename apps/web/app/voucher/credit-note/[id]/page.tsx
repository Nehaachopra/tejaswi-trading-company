import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CreditNoteView } from "~/components/transaction/sale-return/credit-note";

export const metadata: Metadata = { title: "Credit note · Tejaswi trading company", robots: { index: false } };

// a return's credit note sent to the customer on WhatsApp: opens without a login, only with the key in its link
export default async function SharedCreditNotePage({
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
      <CreditNoteView id={id} shareKey={k} />
    </div>
  );
}

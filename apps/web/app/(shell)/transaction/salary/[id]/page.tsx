import type { Metadata } from "next";

import { ReceiptSuccess } from "~/components/transaction/done/success";

export const metadata: Metadata = { title: "Salary paid · Tejaswi trading company" };

// where a saved salary or advance lands, as a receipt's does: that it worked, its number, and what the cash or account
// it was paid from holds now. The admin's
// Salary paid to many in one save: the first one's page, the rest (?also=) listed with it
export default async function SalaryDonePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const also = (q.also ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  return <ReceiptSuccess id={id} flow="salary" also={also} />;
}

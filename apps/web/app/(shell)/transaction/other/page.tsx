import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OtherForm } from "~/components/transaction/other/form";
import { getSession } from "~/trpc/session";

export const metadata: Metadata = { title: "Others · Tejaswi trading company" };

// a journal entry for anything no other page covers, as a form like the receipt's; the admin's only (staff go back to
// the list of transactions)
export default async function OtherPage() {
  const session = await getSession();
  if (session!.user.role !== "admin") redirect("/transaction");
  return <OtherForm />;
}

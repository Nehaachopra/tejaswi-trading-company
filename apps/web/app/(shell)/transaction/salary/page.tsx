import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SalaryForm } from "~/components/transaction/salary/form";
import { getSession } from "~/trpc/session";

export const metadata: Metadata = { title: "Salary · Tejaswi trading company" };

// paying an employee, as a form like the receipt's; the admin's only (staff go back to the list of transactions). Opened
// from a payment's Salary or Advance to employee, it starts with what was picked and typed there
export default async function SalaryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await getSession();
  if (session!.user.role !== "admin") redirect("/transaction");
  const q = await searchParams;
  const amount = Number(q.amount);
  return (
    <SalaryForm
      start={{
        kind: q.for === "salary" || q.for === "advance" ? q.for : null,
        amount: Number.isFinite(amount) && amount > 0 ? String(amount) : "",
        from: q.from === "cash" || q.from === "bank" ? q.from : null,
        bankId: q.from === "bank" && q.bank ? q.bank : null,
      }}
    />
  );
}

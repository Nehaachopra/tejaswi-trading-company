import type { Metadata } from "next";

import { PaymentForm } from "~/components/transaction/payment-form";
import { getSession } from "~/trpc/session";

export const metadata: Metadata = { title: "Payment · Tejaswi trading company" };

// money going out, as a form one card at a time; admin and staff (balances and new ledgers are the admin's)
export default async function PaymentPage() {
  const session = await getSession();
  return <PaymentForm isAdmin={session!.user.role === "admin"} />;
}

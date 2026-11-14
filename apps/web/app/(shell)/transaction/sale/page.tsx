import type { Metadata } from "next";

import { SaleForm } from "~/components/transaction/sale/form";
import { getSession } from "~/trpc/session";

export const metadata: Metadata = { title: "Sale · Tejaswi trading company" };

// goods going out for cash or on credit, as a form one card at a time; admin and staff (adding a customer is the admin's)
export default async function SalePage() {
  const session = await getSession();
  return <SaleForm isAdmin={session!.user.role === "admin"} />;
}

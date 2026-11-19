import type { Metadata } from "next";

import { PurchaseForm } from "~/components/transaction/purchase/form";
import { getSession } from "~/lib/session";

export const metadata: Metadata = { title: "Purchase · Tejaswi trading company" };

// goods coming in from a supplier, for cash or on credit, as a form one card at a time; admin and staff (adding a
// supplier or a product is the admin's)
export default async function PurchasePage() {
  const session = await getSession();
  return <PurchaseForm isAdmin={session!.user.role === "admin"} />;
}

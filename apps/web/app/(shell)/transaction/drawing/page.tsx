import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DrawingForm } from "~/components/transaction/drawing/form";
import { getSession } from "~/lib/session";

export const metadata: Metadata = { title: "Drawing · Tejaswi trading company" };

// what the owner takes out for themselves, money or goods; the admin's only (staff go back to the list of transactions)
export default async function DrawingPage() {
  const session = await getSession();
  if (session!.user.role !== "admin") redirect("/transaction");
  return <DrawingForm />;
}

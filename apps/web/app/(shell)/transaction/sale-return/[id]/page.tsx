import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ReturnSuccess } from "~/components/transaction/sale-return/success";
import { getSession } from "~/lib/session";

export const metadata: Metadata = { title: "Sale return saved · Tejaswi trading company" };

// where a saved sale return lands: that it worked, its number, the credit note and where the money went (the admin's)
export default async function SaleReturnDonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (session!.user.role !== "admin") redirect("/history");
  return <ReturnSuccess id={id} />;
}

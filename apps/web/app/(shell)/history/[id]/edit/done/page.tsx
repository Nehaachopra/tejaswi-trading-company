import type { Metadata } from "next";

import { SaleEditSuccess } from "~/components/transaction/sale-edit/success";

export const metadata: Metadata = { title: "Edit successful · Tejaswi trading company" };

// where a saved sale edit lands: that it worked, its number, items and new total, and back to the sale
export default async function SaleEditDonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SaleEditSuccess id={id} />;
}

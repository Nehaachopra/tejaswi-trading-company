import type { Metadata } from "next";

import { SaleSuccess } from "~/components/transaction/sale/success";

export const metadata: Metadata = { title: "Sale saved · Tejaswi trading company" };

// where a saved sale lands: that it worked, its number, items, total and payment. Admin and staff
export default async function SaleDonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SaleSuccess id={id} />;
}

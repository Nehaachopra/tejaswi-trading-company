import type { Metadata } from "next";

import { SaleInvoice } from "~/components/transaction/sale/invoice";

export const metadata: Metadata = { title: "Tax invoice · Tejaswi trading company" };

// a sale's tax invoice, to print or save as a PDF and share with the customer; admin and staff
export default async function SaleInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SaleInvoice id={id} />;
}

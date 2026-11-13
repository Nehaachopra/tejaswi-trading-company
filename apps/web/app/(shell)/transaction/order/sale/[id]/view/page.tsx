import type { Metadata } from "next";

import { OrderDocument } from "~/components/transaction/order/document";

export const metadata: Metadata = { title: "Sale order · Tejaswi trading company" };

// a sale order as a document, to print or save as a PDF and share with the customer; admin and staff
export default async function SaleOrderViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderDocument kind="sale" id={id} />;
}

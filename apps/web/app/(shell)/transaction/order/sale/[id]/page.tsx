import type { Metadata } from "next";

import { OrderDone } from "~/components/transaction/order/done";

export const metadata: Metadata = { title: "Order saved · Tejaswi trading company" };

// where a saved sale order lands: that it worked, its number and what it is; admin and staff (the shell already checked
// for a session)
export default async function SaleOrderDonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderDone kind="sale" id={id} />;
}

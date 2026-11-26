import type { Metadata } from "next";

import { EditRoute } from "~/components/history/edit-route";

export const metadata: Metadata = { title: "Edit successful · Tejaswi trading company" };

// where a saved edit lands (a sale's or a purchase's): that it worked, its number, items and new total, and back to it
export default async function SaleEditDonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditRoute id={id} done />;
}

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { OrderEditForm } from "~/components/transaction/order/new/edit-form";
import { getSession } from "~/trpc/session";

export const metadata: Metadata = { title: "Edit order · Tejaswi trading company" };

// an order changed, from Edit order on its page: the admin's
export default async function OrderEditPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (kind !== "purchase" && kind !== "sale") notFound();
  const session = await getSession();
  if (session!.user.role !== "admin") redirect(`/order/${kind}/${id}`);
  return <OrderEditForm kind={kind} id={id} />;
}

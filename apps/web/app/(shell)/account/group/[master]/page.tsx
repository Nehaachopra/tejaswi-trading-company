import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GroupBoard } from "~/components/account/group-board";

// the sub-groups listed here: the rest (bank accounts, parties) have pages of their own
const GROUPS = ["lenders", "personalLenders", "agents", "rentPayable", "employees", "gstPayable"] as const;
type Group = (typeof GROUPS)[number];

export const metadata: Metadata = { title: "Accounts · Tejaswi trading company" };

// /account/group/[master]: one sub-group's ledgers (bank loans, rent payable, employees, GST payable); the layout already checked
// for an admin session
export default async function GroupPage({ params }: { params: Promise<{ master: string }> }) {
  const { master } = await params;
  if (!GROUPS.includes(master as Group)) notFound();
  return <GroupBoard master={master as Group} />;
}

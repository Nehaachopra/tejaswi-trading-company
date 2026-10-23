import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AccountsBoard } from "~/components/account/accounts-board";

const HEADS = ["asset", "liability", "income", "expense", "profit", "loss"] as const;
type Head = (typeof HEADS)[number];

export const metadata: Metadata = { title: "Accounts · Tejaswi trading company" };

// one head (Asset, Liability ...) with its sub-groups and ledgers; the layout already checked for an admin
// session. /account/bank and /account/ledgers are their own pages and come before this one
export default async function HeadPage({ params }: { params: Promise<{ head: string }> }) {
  const { head } = await params;
  if (!HEADS.includes(head as Head)) notFound();
  return <AccountsBoard only={head as Head} />;
}

import type { Metadata } from "next";

import { BankPage } from "~/components/account/bank/bank-page";

export const metadata: Metadata = { title: "Bank account · Tejaswi trading company" };

// one bank account: details on top, its ledger below; the layout already checked for an admin session
export default async function BankAccountPage({ params }: { params: Promise<{ account: string }> }) {
  const { account } = await params;
  return <BankPage bankId={account} />;
}

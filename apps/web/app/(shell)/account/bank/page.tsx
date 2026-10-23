import type { Metadata } from "next";

import { BanksBoard } from "~/components/account/bank/banks-board";

export const metadata: Metadata = { title: "Bank accounts · Tejaswi trading company" };

// the layout already checked for an admin session
export default function BankAccountsPage() {
  return <BanksBoard />;
}

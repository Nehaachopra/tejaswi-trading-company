import type { Metadata } from "next";

import { AccountsBoard } from "~/components/account/accounts-board";

export const metadata: Metadata = { title: "Accounts · Tejaswi trading company" };

// every ledger account under its head; the layout already checked for an admin session
export default function AccountPage() {
  return <AccountsBoard />;
}

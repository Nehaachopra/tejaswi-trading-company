import type { Metadata } from "next";

import { BanksManager } from "~/components/entities/banks-manager";

export const metadata: Metadata = { title: "Bank accounts · Tejaswi trading company" };

// bank accounts are added and edited here; the layout already checked for an admin session
export default function BankAccountsManagerPage() {
  return <BanksManager />;
}

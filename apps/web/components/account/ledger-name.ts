"use client";

import { useTranslations } from "next-intl";

// a ledger's name in the reader's language: built-in ledgers (Cash, Sale, Output CGST ...) are translated by
// their key; ledgers people named themselves (a bank account, a party) show as typed
export function useLedgerName() {
  const t = useTranslations("accounts.fixed");
  return (ledger: { key: string | null; name: string }) => (ledger.key && t.has(ledger.key) ? t(ledger.key) : ledger.name);
}

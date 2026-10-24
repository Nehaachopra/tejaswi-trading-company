"use client";

import { useTranslations } from "next-intl";

import { titleCase } from "~/lib/format";

// a ledger's name in the reader's language: built-in ledgers (Cash, Sale, Output CGST ...) are translated by
// their key; the rest are stored in lowercase and start each word with a capital ("water expense" → "Water
// Expense"; a party's short name, kept in capitals, stays as it is)
export function useLedgerName() {
  const t = useTranslations("accounts.fixed");
  return (ledger: { key: string | null; name: string }) => (ledger.key && t.has(ledger.key) ? t(ledger.key) : titleCase(ledger.name));
}

"use client";

import type { RouterInputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type In = RouterInputs["accounts"];

// everything under accounts is read again: ledgers, balances, banks, parties
export function useRefreshAccounts() {
  const utils = trpc.useUtils();
  return () => void utils.accounts.invalidate();
}

// ---- ledgers ----

// the six heads with their totals
export function useAccountsOverview() {
  return trpc.accounts.overview.useQuery();
}

// one head's ledgers
export function useLedgerGroup(master: In["ledger"]["group"]["master"]) {
  return trpc.accounts.ledger.group.useQuery({ master });
}

// one ledger
export function useLedger(id: string) {
  return trpc.accounts.ledger.get.useQuery({ id });
}

// a ledger's entries for the filters given; the ones just shown stay while new filters load
export function useLedgerStatement(input: In["ledger"]["statement"]) {
  return trpc.accounts.ledger.statement.useQuery(input, { placeholderData: (previous) => previous });
}

// the ledgers a transaction can be put on, searched as typed; `keepPrevious` leaves the last answer up while the next loads
export function usePickableLedgers(input: In["ledger"]["pickable"], enabled: boolean, keepPrevious = false) {
  return trpc.accounts.ledger.pickable.useQuery(input, { enabled, placeholderData: keepPrevious ? (previous) => previous : undefined });
}

// a ledger's saves: add, rename, make active or inactive
export function useLedgerActions() {
  return {
    create: trpc.accounts.ledger.create.useMutation(),
    update: trpc.accounts.ledger.update.useMutation(),
    setActive: trpc.accounts.ledger.setActive.useMutation(),
    refreshAccounts: useRefreshAccounts(),
  };
}

// the opening balances sheet and its save
export function useOpening() {
  return {
    sheet: trpc.accounts.opening.get.useQuery(),
    save: trpc.accounts.opening.save.useMutation(),
    refreshAccounts: useRefreshAccounts(),
  };
}

// ---- bank accounts ----

// our bank accounts: active only, or with the inactive ones
export function useBanks(includeInactive: boolean) {
  return trpc.accounts.bank.list.useQuery({ includeInactive });
}

// the bank accounts money can go into or out of
export function usePickableBanks() {
  return trpc.accounts.bank.pickable.useQuery();
}

// one bank account
export function useBank(id: string, enabled = true) {
  return trpc.accounts.bank.get.useQuery({ id }, { enabled });
}

// the bank and branch an IFSC belongs to (it never changes, so it's asked once)
export function useIfsc(ifsc: string, enabled: boolean) {
  return trpc.accounts.bank.ifsc.useQuery({ ifsc }, { enabled, staleTime: Infinity });
}

// the bank names in the branch directory (asked once); `retry` off where a built-in list stands in at once
export function useBankDirectory(retry = true) {
  return trpc.accounts.bank.banks.useQuery(undefined, { staleTime: Infinity, ...(retry ? {} : { retry: false }) });
}

// a bank's branches, searched as typed; the ones just shown stay while the next search loads
export function useBankBranches(input: In["bank"]["branches"], enabled: boolean) {
  return trpc.accounts.bank.branches.useQuery(input, { enabled, placeholderData: (previous) => previous });
}

// a bank account's saves: add, details, make active or inactive
export function useBankActions() {
  return {
    create: trpc.accounts.bank.create.useMutation(),
    update: trpc.accounts.bank.update.useMutation(),
    setActive: trpc.accounts.bank.setActive.useMutation(),
    refreshAccounts: useRefreshAccounts(),
  };
}

// ---- parties ----

// the parties for the filters given; the ones just shown stay while new filters load
export function useParties(filters: In["party"]["list"]) {
  return trpc.accounts.party.list.useQuery(filters, { placeholderData: (previous) => previous });
}

// one party
export function useParty(id: string, enabled = true) {
  return trpc.accounts.party.get.useQuery({ id }, { enabled });
}

// whether a short name is taken, asked fresh each time it's typed
export function useShortNameCheck(shortName: string, exceptId: In["party"]["nameCheck"]["exceptId"]) {
  return trpc.accounts.party.nameCheck.useQuery({ shortName, exceptId }, { enabled: shortName !== "", staleTime: 0 });
}

// the parties with the same name in the same town, asked fresh each time (a party just added counts)
export function useSameNameCheck() {
  const utils = trpc.useUtils();
  return (input: In["party"]["nameCheck"]) => utils.client.accounts.party.nameCheck.query(input);
}

// places saved with our parties: the town for a PIN, and the PIN for a town
export function useSavedPlaces() {
  const utils = trpc.useUtils();
  return {
    pinPlace: (postalCode: string) => utils.accounts.party.pinPlace.fetch({ postalCode }),
    townPin: (city: string) => utils.accounts.party.townPin.fetch({ city }),
  };
}

// a party's saves: add, details, make active or inactive
export function usePartyActions() {
  const utils = trpc.useUtils();
  return {
    create: trpc.accounts.party.create.useMutation(),
    update: trpc.accounts.party.update.useMutation(),
    setActive: trpc.accounts.party.setActive.useMutation(),
    refreshAccounts: useRefreshAccounts(),
    // what a payment form worked out for this party (TDS and the like)
    refreshPayments: () => void utils.transactions.payment.invalidate(),
  };
}

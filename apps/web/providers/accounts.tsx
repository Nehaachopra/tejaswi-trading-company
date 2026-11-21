"use client";

import type { RouterInputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type In = RouterInputs["accounts"];

// a read's state as every hook here gives it: whether it's still coming, or couldn't be had
type Q = { isPending: boolean; isError: boolean };
const state = (q: Q) => ({ loading: q.isPending, loadFailed: q.isError });
// …and for one record: whether it isn't there (or isn't the viewer's), rather than failed
const stateOfOne = (q: Q & { error: { data?: { code?: string } | null } | null }) => ({
  loading: q.isPending,
  notFound: q.isError && q.error?.data?.code === "NOT_FOUND",
  loadFailed: q.isError && q.error?.data?.code !== "NOT_FOUND",
});

// everything under accounts is read again: ledgers, balances, banks, parties
export function useRefreshAccounts() {
  const utils = trpc.useUtils();
  return () => void utils.accounts.invalidate();
}

// ---- ledgers ----

// the six heads with their totals
export function useAccountsOverview() {
  const q = trpc.accounts.overview.useQuery();
  return { heads: q.data?.heads ?? [], ...state(q) };
}

// one head's ledgers
export function useLedgerGroup(master: In["ledger"]["group"]["master"]) {
  const q = trpc.accounts.ledger.group.useQuery({ master });
  return { ledgers: q.data ?? [], ...state(q) };
}

// one ledger
export function useLedger(id: string) {
  const q = trpc.accounts.ledger.get.useQuery({ id });
  return { ledger: q.data, ...state(q) };
}

// a ledger's entries for the filters given; the ones just shown stay while new filters load
export function useLedgerStatement(input: In["ledger"]["statement"]) {
  const q = trpc.accounts.ledger.statement.useQuery(input, { placeholderData: (previous) => previous });
  return { statement: q.data, ...state(q) };
}

// the ledgers a transaction can be put on, searched as typed; `keepPrevious` leaves the last answer up while the next loads
export function usePickableLedgers(input: In["ledger"]["pickable"], enabled: boolean, keepPrevious = false) {
  const q = trpc.accounts.ledger.pickable.useQuery(input, { enabled, placeholderData: keepPrevious ? (previous) => previous : undefined });
  return { ledgers: q.data ?? [], ...state(q) };
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
  const q = trpc.accounts.bank.list.useQuery({ includeInactive });
  return { banks: q.data ?? [], ...state(q) };
}

// the bank accounts money can go into or out of
export function usePickableBanks() {
  const q = trpc.accounts.bank.pickable.useQuery();
  return { banks: q.data ?? [], ...state(q) };
}

// one bank account
export function useBank(id: string, enabled = true) {
  const q = trpc.accounts.bank.get.useQuery({ id }, { enabled });
  return { bank: q.data, ...stateOfOne(q) };
}

// the bank and branch an IFSC belongs to (it never changes, so it's asked once)
// (`branch` is null for an IFSC nobody knows; undefined until asked)
export function useIfsc(ifsc: string, enabled: boolean) {
  const q = trpc.accounts.bank.ifsc.useQuery({ ifsc }, { enabled, staleTime: Infinity });
  return { branch: q.data, fetching: q.isFetching, loadFailed: q.isError };
}

// the bank names in the branch directory (asked once); `retry` off where a built-in list stands in at once
export function useBankDirectory(retry = true) {
  const q = trpc.accounts.bank.banks.useQuery(undefined, { staleTime: Infinity, ...(retry ? {} : { retry: false }) });
  return { bankNames: q.data ?? [] };
}

// a bank's branches, searched as typed; the ones just shown stay while the next search loads
export function useBankBranches(input: In["bank"]["branches"], enabled: boolean) {
  const q = trpc.accounts.bank.branches.useQuery(input, { enabled, placeholderData: (previous) => previous });
  return { branches: q.data, fetching: q.isFetching };
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
  const q = trpc.accounts.party.list.useQuery(filters, { placeholderData: (previous) => previous });
  return { parties: q.data ?? [], ...state(q) };
}

// one party
export function useParty(id: string, enabled = true) {
  const q = trpc.accounts.party.get.useQuery({ id }, { enabled });
  return { party: q.data, ...stateOfOne(q) };
}

// whether a short name is taken, asked fresh each time it's typed
// (undefined until the answer comes)
export function useShortNameCheck(shortName: string, exceptId: In["party"]["nameCheck"]["exceptId"]) {
  const q = trpc.accounts.party.nameCheck.useQuery({ shortName, exceptId }, { enabled: shortName !== "", staleTime: 0 });
  return { check: q.data };
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

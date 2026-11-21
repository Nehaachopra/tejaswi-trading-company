"use client";

import { trpc } from "~/trpc/client";

// ---- landlords ----

// the landlords: active only, or with the inactive ones
export function useLandlordList(includeInactive: boolean) {
  const q = trpc.accounts.landlord.list.useQuery({ includeInactive });
  return { landlords: q.data, loading: q.isPending, loadFailed: q.isError };
}

// the landlords to pick from, for a rented godown
export function useLandlordChoices(enabled: boolean) {
  const q = trpc.accounts.landlord.pick.useQuery(undefined, { enabled });
  return { landlords: q.data, loading: q.isPending, loadFailed: q.isError };
}

// one landlord's saved details (asked only once there is one to edit)
export function useLandlord(id: string | null) {
  const q = trpc.accounts.landlord.get.useQuery({ id: id ?? "" }, { enabled: !!id });
  return { landlord: q.data, loading: q.isPending, loadFailed: q.isError };
}

// a landlord's saves: add, details, make active or inactive
export function useLandlordActions() {
  const utils = trpc.useUtils();
  return {
    create: trpc.accounts.landlord.create.useMutation(),
    update: trpc.accounts.landlord.update.useMutation(),
    setActive: trpc.accounts.landlord.setActive.useMutation(),
    // the landlords are read again (it can be waited for)
    refreshLandlords: () => utils.accounts.landlord.invalidate(),
  };
}

// ---- lenders ----

// the lenders (banks and NBFCs): active only, or with the inactive ones
export function useLenders(includeInactive: boolean) {
  const q = trpc.accounts.lender.list.useQuery({ includeInactive });
  return { lenders: q.data, loading: q.isPending, loadFailed: q.isError };
}

// a lender's saves: add, details, make active or inactive
export function useLenderActions() {
  const utils = trpc.useUtils();
  return {
    create: trpc.accounts.lender.create.useMutation(),
    update: trpc.accounts.lender.update.useMutation(),
    setActive: trpc.accounts.lender.setActive.useMutation(),
    refreshLenders: () => void utils.accounts.lender.invalidate(),
    // the loans too, which carry the lender's name
    refreshLendersAndDues: () => {
      void utils.accounts.lender.invalidate();
      void utils.transactions.due.invalidate();
    },
  };
}

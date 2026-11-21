"use client";

import { trpc } from "~/trpc/client";

// a saved transaction read back, for its success page or voucher. Each is asked only while `enabled` (the page knows
// which kind it is showing)

export function useSavedReceipt(transactionId: string, enabled: boolean) {
  const q = trpc.transactions.receipt.get.useQuery({ transactionId }, { enabled });
  return { saved: q.data, loading: q.isPending, loadFailed: q.isError };
}

export function useSavedPayment(transactionId: string, enabled: boolean) {
  const q = trpc.transactions.payment.get.useQuery({ transactionId }, { enabled });
  return { saved: q.data, loading: q.isPending, loadFailed: q.isError };
}

export function useSavedDeposit(transactionId: string, enabled: boolean) {
  const q = trpc.transactions.deposit.get.useQuery({ transactionId }, { enabled });
  return { saved: q.data, loading: q.isPending, loadFailed: q.isError };
}

export function useSavedWithdrawal(transactionId: string, enabled: boolean) {
  const q = trpc.transactions.withdrawal.get.useQuery({ transactionId }, { enabled });
  return { saved: q.data, loading: q.isPending, loadFailed: q.isError };
}

export function useSavedTransfer(transactionId: string, enabled: boolean) {
  const q = trpc.transactions.transfer.get.useQuery({ transactionId }, { enabled });
  return { saved: q.data, loading: q.isPending, loadFailed: q.isError };
}

// a journal entry (Others)
export function useSavedOther(transactionId: string, enabled: boolean) {
  const q = trpc.transactions.other.get.useQuery({ transactionId }, { enabled });
  return { saved: q.data, loading: q.isPending, loadFailed: q.isError };
}

// a drawing (money or goods)
export function useSavedDrawing(transactionId: string, enabled: boolean) {
  const q = trpc.transactions.drawing.get.useQuery({ transactionId }, { enabled });
  return { saved: q.data, loading: q.isPending, loadFailed: q.isError };
}

// a salary or advance
export function useSavedSalary(transactionId: string, enabled: boolean) {
  const q = trpc.transactions.salary.get.useQuery({ transactionId }, { enabled });
  return { saved: q.data, loading: q.isPending, loadFailed: q.isError };
}

// salary paid to many: every other payment made with it
// (null until every one is in hand)
export function useSavedSalaries(transactionIds: string[]) {
  const qs = trpc.useQueries((q) => transactionIds.map((transactionId) => q.transactions.salary.get({ transactionId })));
  return { salaries: qs.every((x) => x.data) ? qs.map((x) => x.data!) : null };
}

// the other side's copy, opened without a login with the key from a shared link (not tried again when the key is wrong)
export function useSharedReceipt(transactionId: string, key: string, enabled: boolean) {
  const q = trpc.transactions.receipt.shared.useQuery({ transactionId, key }, { enabled, retry: false });
  return { saved: q.data, loading: q.isPending, loadFailed: q.isError };
}

export function useSharedPayment(transactionId: string, key: string, enabled: boolean) {
  const q = trpc.transactions.payment.shared.useQuery({ transactionId, key }, { enabled, retry: false });
  return { saved: q.data, loading: q.isPending, loadFailed: q.isError };
}

// the key for the voucher's link, sent on WhatsApp
// (undefined until it comes)
export function useReceiptShareKey(transactionId: string, enabled: boolean) {
  const q = trpc.transactions.receipt.shareKey.useQuery({ transactionId }, { enabled });
  return { key: q.data?.key };
}

export function usePaymentShareKey(transactionId: string, enabled: boolean) {
  const q = trpc.transactions.payment.shareKey.useQuery({ transactionId }, { enabled });
  return { key: q.data?.key };
}

// the copies kept as files (a payment under reverse charge), newest first; none yet isn't tried again
export function useStoredCopies(transactionId: string, enabled: boolean) {
  const q = trpc.transactions.history.documents.useQuery({ transactionId }, { enabled, retry: false });
  return { copies: q.data ?? [] };
}

// what cash and each bank account hold (null for staff). `fresh` asks again every time the page opens, so it
// includes the transaction just saved
// (`fetching` while it's asked again)
export function useMoneyHeld({ enabled = true, fresh = false }: { enabled?: boolean; fresh?: boolean } = {}) {
  const q = trpc.transactions.payment.sources.useQuery(undefined, { enabled, ...(fresh ? { refetchOnMount: "always" as const } : {}) });
  return { money: q.data, fetching: q.isFetching };
}

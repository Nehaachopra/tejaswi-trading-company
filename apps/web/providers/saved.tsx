"use client";

import { trpc } from "~/trpc/client";

// a saved transaction read back, for its success page or voucher. Each is asked only while `enabled` (the page knows
// which kind it is showing)

export function useSavedReceipt(transactionId: string, enabled: boolean) {
  return trpc.transactions.receipt.get.useQuery({ transactionId }, { enabled });
}

export function useSavedPayment(transactionId: string, enabled: boolean) {
  return trpc.transactions.payment.get.useQuery({ transactionId }, { enabled });
}

export function useSavedDeposit(transactionId: string, enabled: boolean) {
  return trpc.transactions.deposit.get.useQuery({ transactionId }, { enabled });
}

export function useSavedWithdrawal(transactionId: string, enabled: boolean) {
  return trpc.transactions.withdrawal.get.useQuery({ transactionId }, { enabled });
}

export function useSavedTransfer(transactionId: string, enabled: boolean) {
  return trpc.transactions.transfer.get.useQuery({ transactionId }, { enabled });
}

// a journal entry (Others)
export function useSavedOther(transactionId: string, enabled: boolean) {
  return trpc.transactions.other.get.useQuery({ transactionId }, { enabled });
}

// a salary or advance
export function useSavedSalary(transactionId: string, enabled: boolean) {
  return trpc.transactions.salary.get.useQuery({ transactionId }, { enabled });
}

// salary paid to many: every other payment made with it
export function useSavedSalaries(transactionIds: string[]) {
  return trpc.useQueries((q) => transactionIds.map((transactionId) => q.transactions.salary.get({ transactionId })));
}

// the other side's copy, opened without a login with the key from a shared link (not tried again when the key is wrong)
export function useSharedReceipt(transactionId: string, key: string, enabled: boolean) {
  return trpc.transactions.receipt.shared.useQuery({ transactionId, key }, { enabled, retry: false });
}

export function useSharedPayment(transactionId: string, key: string, enabled: boolean) {
  return trpc.transactions.payment.shared.useQuery({ transactionId, key }, { enabled, retry: false });
}

// the key for the voucher's link, sent on WhatsApp
export function useReceiptShareKey(transactionId: string, enabled: boolean) {
  return trpc.transactions.receipt.shareKey.useQuery({ transactionId }, { enabled });
}

export function usePaymentShareKey(transactionId: string, enabled: boolean) {
  return trpc.transactions.payment.shareKey.useQuery({ transactionId }, { enabled });
}

// the copies kept as files (a payment under reverse charge), newest first; none yet isn't tried again
export function useStoredCopies(transactionId: string, enabled: boolean) {
  return trpc.transactions.history.documents.useQuery({ transactionId }, { enabled, retry: false });
}

// what cash and each bank account hold (null for staff). `fresh` asks again every time the page opens, so it
// includes the transaction just saved
export function useMoneyHeld({ enabled = true, fresh = false }: { enabled?: boolean; fresh?: boolean } = {}) {
  return trpc.transactions.payment.sources.useQuery(undefined, { enabled, ...(fresh ? { refetchOnMount: "always" as const } : {}) });
}

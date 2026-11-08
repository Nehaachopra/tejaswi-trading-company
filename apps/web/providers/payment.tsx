"use client";

import { createContext, useContext } from "react";

import type { RouterInputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type PaymentIn = RouterInputs["transactions"]["payment"];

// every read here is tried again 3 times by itself (the query client's default) before it counts as failed; then the
// form says so and offers Try again (retry). The save is never retried by itself, so a payment can't go in twice

// what the payment form needs from the server before anything is typed: the bank accounts, what cash and each account
// hold (null for staff, who don't see balances), and the save. Made once for the page; the form reads it with usePayment()
function usePaymentData() {
  const utils = trpc.useUtils();
  const banks = trpc.accounts.bank.pickable.useQuery();
  const sources = trpc.transactions.payment.sources.useQuery();
  const create = trpc.transactions.payment.create.useMutation();

  // saves a payment, then what changed with it is asked again (balances, dues, ledgers), and the saved payment is put
  // in hand for its own page
  async function savePayment(input: PaymentIn["create"]) {
    const r = await create.mutateAsync(input);
    void utils.accounts.invalidate();
    void utils.transactions.payment.sources.invalidate();
    void utils.transactions.due.invalidate();
    utils.transactions.payment.get.setData({ transactionId: r.transactionId }, r);
    utils.transactions.payment.balances.setData({ transactionId: r.transactionId }, r.balances);
    return r;
  }

  return {
    banks: banks.data,
    sources: sources.data,
    // still asking for either (a failed ask isn't loading)
    loading: banks.isPending || sources.isPending,
    // either couldn't be had, even after the retries; Try again asks for whichever failed
    loadFailed: banks.isError || sources.isError,
    retryLoad: () => {
      if (banks.isError) void banks.refetch();
      if (sources.isError) void sources.refetch();
    },
    savePayment,
    saving: create.isPending,
    saved: create.isSuccess,
  };
}

const PaymentContext = createContext<ReturnType<typeof usePaymentData> | null>(null);

export function PaymentProvider({ children }: { children: React.ReactNode }) {
  const value = usePaymentData();
  return <PaymentContext.Provider value={value}>{children}</PaymentContext.Provider>;
}

export function usePayment() {
  const value = useContext(PaymentContext);
  if (!value) throw new Error("usePayment is used outside PaymentProvider");
  return value;
}

// what the server works out from what's typed, asked as the form fills in (each only while `enabled`). Each gives its
// data, whether it failed (only while it's asked), and a retry

// the open loans we took, for a repayment or its interest
export function useOpenLoans(enabled: boolean) {
  const q = trpc.transactions.due.openLoans.useQuery({ kind: "loanTaken" }, { enabled });
  return {
    loans: q.data,
    loansLoading: q.isPending,
    loansFailed: enabled && q.isError,
    retryLoans: () => void q.refetch(),
  };
}

// the landlords, for rent
export function useLandlords(enabled: boolean) {
  const q = trpc.accounts.landlord.pick.useQuery(undefined, { enabled });
  return {
    landlords: q.data,
    landlordsFailed: enabled && q.isError,
    retryLandlords: () => void q.refetch(),
  };
}

// a supplier's TDS (section 194Q)
export function useSupplierTds(input: PaymentIn["supplierTds"], enabled: boolean) {
  const q = trpc.transactions.payment.supplierTds.useQuery(input, { enabled });
  return {
    supplierTds: q.data,
    supplierTdsFailed: enabled && q.isError,
    retrySupplierTds: () => void q.refetch(),
  };
}

// an expense's TDS and reverse-charge GST
export function useExpenseTax(input: PaymentIn["expenseTax"], enabled: boolean) {
  const q = trpc.transactions.payment.expenseTax.useQuery(input, { enabled });
  return {
    expenseTax: q.data,
    expenseTaxFailed: enabled && q.isError,
    retryExpenseTax: () => void q.refetch(),
  };
}

// the TDS on interest paid on a loan we took
export function useInterestTds(input: PaymentIn["interestTds"], enabled: boolean) {
  const q = trpc.transactions.payment.interestTds.useQuery(input, { enabled });
  return {
    interestTds: q.data,
    interestTdsFailed: enabled && q.isError,
    retryInterestTds: () => void q.refetch(),
  };
}

// whether cash and the bank accounts picked hold the amount (asked for staff, who don't see balances); undefined until
// the server says
export function usePaymentFits(input: PaymentIn["fits"], enabled: boolean) {
  const q = trpc.transactions.payment.fits.useQuery(input, { enabled });
  return {
    fits: q.data?.fits,
    fitsFailed: enabled && q.isError,
    retryFits: () => void q.refetch(),
  };
}

// what was paid in cash to the same person that day (section 40A(3)); 0 until the server says
export function useCashToday(input: PaymentIn["cashToday"], enabled: boolean) {
  const q = trpc.transactions.payment.cashToday.useQuery(input, { enabled });
  return {
    cashTodayPaid: q.data?.paid ?? 0,
    cashTodayFailed: enabled && q.isError,
    retryCashToday: () => void q.refetch(),
  };
}

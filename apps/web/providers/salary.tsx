"use client";

import { createContext, useContext } from "react";

import type { RouterInputs } from "@repo/trpc/client";
import { trpc } from "~/trpc/client";

type PayIn = RouterInputs["transactions"]["salary"]["pay"];
type PayAllIn = RouterInputs["transactions"]["salary"]["payAll"];

// what the salary form needs from the server before anything is typed: the employees (with their pay, the advance they
// owe and the months still owed), the bank accounts, what cash and each account hold, and the save. Made once for the
// page; the form reads it with useSalary(). Every read is tried again 3 times by itself before it counts as failed; the
// save never is
function useSalaryData() {
  const utils = trpc.useUtils();
  const employees = trpc.transactions.salary.employees.useQuery();
  const banks = trpc.accounts.bank.pickable.useQuery();
  const sources = trpc.transactions.payment.sources.useQuery();
  const pay = trpc.transactions.salary.pay.useMutation();
  const payAll = trpc.transactions.salary.payAll.useMutation();

  // saves the payment, then what changed with it is asked again, and the saved payment is put in hand for its own page
  async function savePay(input: PayIn) {
    const s = await pay.mutateAsync(input);
    void utils.accounts.invalidate();
    void utils.transactions.payment.sources.invalidate();
    void utils.transactions.salary.employees.invalidate();
    utils.transactions.salary.get.setData({ transactionId: s.transactionId }, s);
    return s;
  }

  // salary to many employees: a transaction each, every one put in hand for the page after
  async function savePayAll(input: PayAllIn) {
    const list = await payAll.mutateAsync(input);
    void utils.accounts.invalidate();
    void utils.transactions.payment.sources.invalidate();
    void utils.transactions.salary.employees.invalidate();
    for (const s of list) utils.transactions.salary.get.setData({ transactionId: s.transactionId }, s);
    return list;
  }

  return {
    employees: employees.data,
    banks: banks.data,
    sources: sources.data,
    loading: employees.isPending || banks.isPending || sources.isPending,
    loadFailed: employees.isError || banks.isError || sources.isError,
    retryLoad: () => {
      if (employees.isError) void employees.refetch();
      if (banks.isError) void banks.refetch();
      if (sources.isError) void sources.refetch();
    },
    savePay,
    savePayAll,
    // an employee's details changed here: the list asked again
    refreshEmployees: () => void utils.transactions.salary.employees.invalidate(),
    saving: pay.isPending || payAll.isPending,
    saved: pay.isSuccess || payAll.isSuccess,
  };
}

const SalaryContext = createContext<ReturnType<typeof useSalaryData> | null>(null);

export function SalaryProvider({ children }: { children: React.ReactNode }) {
  const value = useSalaryData();
  return <SalaryContext.Provider value={value}>{children}</SalaryContext.Provider>;
}

export function useSalary() {
  const value = useContext(SalaryContext);
  if (!value) throw new Error("useSalary is used outside SalaryProvider");
  return value;
}

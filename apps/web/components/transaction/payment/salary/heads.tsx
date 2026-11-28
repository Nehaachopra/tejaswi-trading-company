"use client";

import { createContext, useContext } from "react";

import { useTranslations } from "next-intl";

import { chip } from "../shared";
import { usePaymentEntry } from "../state";

// what Salary and Advance to employee do: the payment page turns into the salary flow, on its employees stage
export const SalaryHandOff = createContext<((kind: "salary" | "advance") => void) | null>(null);

// Paid for's two salary heads, the admin's only: Salary and Advance to employee. Each goes on to the salary flow right
// here on the payment page (its employees stage next), set to it
export function SalaryHeads() {
  const t = useTranslations("transactions.salary");
  const { isAdmin } = usePaymentEntry();
  const go = useContext(SalaryHandOff);
  if (!isAdmin || !go) return null;
  return (
    <>
      <button type="button" onClick={() => go("salary")} className={chip(false)}>
        {t("heads.salary")}
      </button>
      <button type="button" onClick={() => go("advance")} className={chip(false)}>
        {t("heads.advance")}
      </button>
    </>
  );
}

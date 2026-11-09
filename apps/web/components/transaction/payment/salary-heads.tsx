"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { chip } from "./shared";
import { usePaymentEntry } from "./state";

// Paid for's two salary heads, the admin's only: Salary and Advance to employee. Each hands over to the salary form, set
// to it, with the amount and where it's paid from (cash or one bank account) already typed here carried over
export function SalaryHeads() {
  const t = useTranslations("transactions.salary");
  const router = useRouter();
  const { isAdmin, value, into, bankId } = usePaymentEntry();
  if (!isAdmin) return null;
  const go = (kind: "salary" | "advance") => {
    const carried = new URLSearchParams({ for: kind });
    if (value > 0) carried.set("amount", String(value));
    // the salary form pays from cash or one bank account: Cash + Bank isn't carried
    if (into === "cash") carried.set("from", "cash");
    if (into === "bank" && bankId) {
      carried.set("from", "bank");
      carried.set("bank", bankId);
    }
    router.push(`/transaction/salary?${carried.toString()}`);
  };
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

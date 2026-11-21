"use client";

import { useTranslations } from "next-intl";

import { chip } from "../shared/form-basics";
import { useReturnEntry } from "./state";

// a customer's refund, in cash or on credit, as a sale's Cash or credit: two chips, nothing else; either moves on
export function MoneyStage() {
  const { refundIn, pickRefundIn } = useReturnEntry();
  const ts = useTranslations("transactions.sale");
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={ts("steps.money")}>
      {(["cash", "credit"] as const).map((k) => (
        <button key={k} type="button" aria-pressed={refundIn === k} onClick={() => pickRefundIn(k)} className={chip(refundIn === k)}>
          {ts(`kinds.${k}`)}
        </button>
      ))}
    </div>
  );
}

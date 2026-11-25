"use client";

import { chip } from "../shared/form-basics";
import { useReturnEntry } from "./state";

// with any item refunded: Refund or Buy something else, two chips, nothing else. Refund moves on to where the money
// goes; Buy something else to Details, whose Next opens the new sale
export function SettleCard() {
  const { t, mode, pickMode } = useReturnEntry();
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t("steps.settle")}>
      {(["refund", "exchange"] as const).map((m) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => pickMode(m)} className={chip(mode === m)}>
          {t(`modes.${m}`)}
        </button>
      ))}
    </div>
  );
}

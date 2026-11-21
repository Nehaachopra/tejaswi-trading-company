"use client";

import { chip } from "../shared/form-basics";
import { useReturnEntry } from "./state";

// Exchange or Refund: two chips, nothing else. Refund moves on to where the money goes; Exchange to Details, whose Next
// opens the new sale
export function SettleCard() {
  const { t, mode, pickMode } = useReturnEntry();
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t("steps.settle")}>
      {(["exchange", "refund"] as const).map((m) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => pickMode(m)} className={chip(mode === m)}>
          {t(`modes.${m}`)}
        </button>
      ))}
    </div>
  );
}

"use client";

import { chip } from "../shared/form-basics";
import { useSaleEntry } from "./state";

// Cash or credit: two chips, nothing else. Either moves straight on to the customer; a cash sale's money is asked on
// the Received card, once it's known who is paying
export function MoneyCard() {
  const { t, kind, pickKind } = useSaleEntry();
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t("steps.money")}>
      {(["cash", "credit"] as const).map((k) => (
        <button key={k} type="button" aria-pressed={kind === k} onClick={() => pickKind(k)} className={chip(kind === k)}>
          {t(`kinds.${k}`)}
        </button>
      ))}
    </div>
  );
}

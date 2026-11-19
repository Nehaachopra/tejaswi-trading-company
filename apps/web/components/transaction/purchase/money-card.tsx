"use client";

import { chip } from "../shared/form-basics";
import { usePurchaseEntry } from "./state";

// Cash or credit: two chips, nothing else. Either moves straight on to the supplier
export function MoneyCard() {
  const { ts, kind, pickKind } = usePurchaseEntry();
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={ts("steps.money")}>
      {(["cash", "credit"] as const).map((k) => (
        <button key={k} type="button" aria-pressed={kind === k} onClick={() => pickKind(k)} className={chip(kind === k)}>
          {ts(`kinds.${k}`)}
        </button>
      ))}
    </div>
  );
}

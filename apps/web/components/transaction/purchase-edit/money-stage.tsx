"use client";

import { chip } from "../shared/form-basics";
import { usePurchaseEdit } from "./state";

// Cash or credit, as a sale return's: two chips, nothing else; either moves straight on
export function MoneyStage() {
  const { ts, kind, pickKind } = usePurchaseEdit();
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

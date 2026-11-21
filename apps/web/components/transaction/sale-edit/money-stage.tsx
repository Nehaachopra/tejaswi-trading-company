"use client";

import { chip } from "../shared/form-basics";
import { useSaleEdit } from "./state";

// Cash or credit, as a sale's: two chips (the saved one picked), nothing else; either moves straight on
export function MoneyStage() {
  const { t, kind, pickKind } = useSaleEdit();
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

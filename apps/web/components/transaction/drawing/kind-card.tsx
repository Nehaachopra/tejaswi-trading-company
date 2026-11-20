"use client";

import { chip } from "../shared/form-basics";
import { useDrawingEntry } from "./state";

// Money or goods: two chips, nothing else. Either moves straight on to its next card
export function KindCard() {
  const { t, kind, pickKind } = useDrawingEntry();
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t("steps.kind")}>
      {(["money", "goods"] as const).map((k) => (
        <button key={k} type="button" aria-pressed={kind === k} onClick={() => pickKind(k)} className={chip(kind === k)}>
          {t(`kinds.${k}`)}
        </button>
      ))}
    </div>
  );
}

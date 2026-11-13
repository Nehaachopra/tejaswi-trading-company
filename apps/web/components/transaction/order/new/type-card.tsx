"use client";

import { chip } from "../../shared/form-basics";
import { useOrderEntry } from "./state";

// Purchase (the admin's) or Sale, as the payment's Paid for: a chip moves on by itself
export function TypeCard() {
  const { t, isAdmin, kind, setKind, show } = useOrderEntry();
  return (
    <div role="radiogroup" aria-label={t("steps.type")} className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {/* purchase orders are the admin's */}
      {isAdmin && (
        <button
          type="button"
          role="radio"
          aria-checked={kind === "purchase"}
          onClick={() => {
            setKind("purchase");
            show("products");
          }}
          className={chip(kind === "purchase")}
        >
          {t("kinds.purchase")}
        </button>
      )}
      <button
        type="button"
        role="radio"
        aria-checked={kind === "sale"}
        onClick={() => {
          setKind("sale");
          show("products");
        }}
        className={chip(kind === "sale")}
      >
        {t("kinds.sale")}
      </button>
    </div>
  );
}

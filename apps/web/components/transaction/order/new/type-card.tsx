"use client";

import { toast } from "~/components/ui/toast";
import { cn } from "~/lib/utils";

import { chip } from "../../shared/form-basics";
import { useOrderEntry } from "./state";

// Purchase or Sale, as the payment's Paid for: a chip moves on by itself. Sale orders aren't built yet, so Sale shows
// faded and says so
export function TypeCard() {
  const { t, kind, setKind, show } = useOrderEntry();
  return (
    <div role="radiogroup" aria-label={t("steps.type")} className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
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
      <button
        type="button"
        role="radio"
        aria-checked={false}
        onClick={() => toast.info(t("saleSoon"))}
        className={cn(chip(false), "opacity-60")}
      >
        {t("kinds.sale")}
      </button>
    </div>
  );
}

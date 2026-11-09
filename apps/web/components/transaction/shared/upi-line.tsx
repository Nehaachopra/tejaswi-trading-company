"use client";

import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";

// a UPI ID that's already there (saved, or typed and fine), shown as text under its name with Edit beside it; Edit
// brings back the box to change it. The forms show the box itself only while there's none, or once Edit is tapped
export function UpiLine({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  const t = useTranslations("transactions.payment.form");
  return (
    <div className="flex flex-col gap-2 text-xs font-semibold">
      <span>{label}</span>
      <span className="flex min-h-11 items-center justify-between gap-3">
        <span className="tabular min-w-0 truncate text-base font-semibold" title={value}>
          {value}
        </span>
        <button
          type="button"
          onClick={onEdit}
          className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-control border border-chestnut/50 px-3 text-sm font-semibold hover:border-chestnut"
        >
          <Pencil className="size-3.5" aria-hidden /> {t("editUpi")}
        </button>
      </span>
    </div>
  );
}

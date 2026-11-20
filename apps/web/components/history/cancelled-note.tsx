"use client";

import { Ban } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

// a cancelled transaction's note above its document (not printed): that it's cancelled, when and by whom, and why
export function CancelledNote({ at, by, reason }: { at: Date | string | null; by: string | null; reason: string | null }) {
  const t = useTranslations("history");
  const locale = useLocale();
  const when = at
    ? new Date(at).toLocaleString(`${locale}-IN`, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      })
    : null;
  return (
    <div role="status" className="no-print mb-4 flex flex-col gap-1 rounded-control bg-[#fdecea] px-4 py-3 text-danger">
      <p className="flex items-center gap-2 font-semibold">
        <Ban className="size-4" strokeWidth={2.5} aria-hidden /> {t("cancelled")}
      </p>
      {when && by && <p className="text-sm">{t("cancelledOn", { when, name: by })}</p>}
      {reason && <p className="text-sm">{t("reasonLine", { reason })}</p>}
    </div>
  );
}

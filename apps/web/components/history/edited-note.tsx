"use client";

import { Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

// an edited transaction's note above its document (not printed): when it was last edited and by whom
export function EditedNote({ at, by }: { at: Date | string; by: string }) {
  const t = useTranslations("history");
  const locale = useLocale();
  const when = new Date(at).toLocaleString(`${locale}-IN`, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
  return (
    <p role="status" className="no-print mb-4 flex items-center gap-2 rounded-control bg-ivory/10 px-4 py-2.5 text-sm text-ivory">
      <Pencil className="size-4 shrink-0" aria-hidden /> {t("lastEdited", { when, name: by })}
    </p>
  );
}

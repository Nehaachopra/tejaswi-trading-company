"use client";

import { useTranslations } from "next-intl";

import { cn } from "~/lib/utils";

import { PICKED } from "../ui/page-styles";

// Edit and Change under what's picked: the same words-only button, big enough to tap
const PICKED_ACTION =
  "min-h-9 shrink-0 rounded-control px-3 text-sm font-semibold underline underline-offset-2 hover:bg-ivory/10";

// what's picked, the same everywhere: who it is on the left, what's due (or advanced, or left) on the right, then Edit
// and Change in words on a row of their own under a thin line. Just a name (oneLine): Edit and Change beside it instead
export function PickedCard({
  children,
  aside,
  onEdit,
  onChange,
  oneLine = false,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
  onEdit?: () => void;
  onChange: () => void;
  oneLine?: boolean;
}) {
  const t = useTranslations("transactions.picker");
  // Edit (when it can be changed here) and Change, which lets go of the pick
  const actions = (
    <>
      {onEdit && (
        <button type="button" onClick={onEdit} className={PICKED_ACTION}>
          {t("edit")}
        </button>
      )}
      <button type="button" onClick={onChange} className={PICKED_ACTION}>
        {t("change")}
      </button>
    </>
  );
  if (oneLine)
    return (
      <div className={PICKED}>
        {children}
        <span className="flex shrink-0 gap-1">{actions}</span>
      </div>
    );
  return (
    <div className={cn(PICKED, "flex-col items-stretch gap-2")}>
      {/* who it is, and its amount beside */}
      <div className="flex min-w-0 items-start gap-3">
        {children}
        {aside}
      </div>
      <div className="flex justify-end gap-1 border-t border-ivory/20 pt-1.5">{actions}</div>
    </div>
  );
}

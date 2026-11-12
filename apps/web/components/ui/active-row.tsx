"use client";

import { useTranslations } from "next-intl";

import { Switch } from "./switch";

// at the top of an edit sheet (a party, landlord, lender or bank account): whether it's active, as a switch. Off, it's
// inactive: kept with its history but left out of the lists that pick from it. Flipping it saves at once
export function ActiveRow({ on, onFlip }: { on: boolean; onFlip: (on: boolean) => void }) {
  const t = useTranslations("common");
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-control bg-chestnut/6 px-3.5 text-sm font-semibold">
      <span id="active-row-label">{t("active")}</span>
      <Switch on={on} onFlip={onFlip} labelledBy="active-row-label" />
    </div>
  );
}

"use client";

import { IndianRupee, QrCode } from "lucide-react";
import { useTranslations } from "next-intl";

import { type BankMode } from "@repo/trpc/client";
import { NumberInput } from "~/components/ui/number-input";
import { rupees } from "~/lib/format";
import { cn } from "~/lib/utils";

import { ModeChips } from "./bank-mode";
import { input } from "./form-basics";

// one box of the grid: cash or a bank account, what it holds (null: not shown), the amount typed, and for an account
// how the money went
export type GridPlace = {
  id: string;
  name: string;
  sub: string | null;
  held: number | null;
  text: string;
  amount: number;
  mode: BankMode | null;
};

// Bank, or Cash + Bank: a box each, two to a row on wider screens. Each: its name and what it holds on the left, the
// amount on the right (chestnut once there's one; red past what it holds, when that's a limit); an account taking
// something then asks how. Auto (a payment's) fills them from what each holds, cash first; typing turns it off.
// `extra` adds a box's own part under it (a UPI ID asked, Show QR code)
export function SplitGrid({
  places,
  onText,
  onMode,
  auto,
  capAtHeld,
  modeLabel,
  modeMissing,
  tried,
  extra,
}: {
  places: GridPlace[];
  onText: (id: string, text: string) => void;
  onMode: (id: string, mode: BankMode) => void;
  auto?: { on: boolean; set: (on: boolean) => void };
  capAtHeld: boolean;
  modeLabel: string;
  modeMissing: string;
  tried: boolean;
  extra?: (place: GridPlace) => React.ReactNode;
}) {
  const t = useTranslations("transactions.salary");
  return (
    <div className="flex flex-col gap-2.5">
      {auto && <AutoSwitch on={auto.on} set={auto.set} />}
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-x-3">
        {places.map((p) => {
          const short = capAtHeld && p.held !== null && p.amount > p.held;
          return (
            <div
              key={p.id}
              className={cn(
                "flex min-w-0 flex-col gap-3 rounded-control p-3 shadow-[0_0_5px_0] shadow-chestnut/25",
                p.amount > 0 && "bg-chestnut/8",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 flex-col text-sm">
                  <span className="truncate font-semibold">
                    {p.name}
                    {p.sub && <span className="ml-1.5 font-normal opacity-70">{p.sub}</span>}
                  </span>
                  {p.held !== null && (
                    <span className={cn("tabular text-xs", short && "text-danger")}>
                      {rupees(p.held)}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "relative block w-32 shrink-0",
                    p.amount > 0 && !short && "text-ivory",
                  )}
                >
                  <IndianRupee
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
                    aria-hidden
                  />
                  <NumberInput
                    value={p.text}
                    onChange={(v) => onText(p.id, v)}
                    decimals={2}
                    maxDigits={13}
                    max={capAtHeld ? (p.held ?? undefined) : undefined}
                    placeholder="0"
                    aria-label={p.name}
                    aria-invalid={short || undefined}
                    className={cn(
                      input(short),
                      "pl-9 text-right font-heading text-lg font-bold tabular",
                      p.amount > 0 && !short && "bg-chestnut text-ivory caret-ivory",
                    )}
                  />
                </span>
              </div>
              {p.id !== "cash" && p.amount > 0 && (
                <div className="flex flex-col gap-2 text-xs font-semibold">
                  <ModeChips
                    label={modeLabel}
                    missing={modeMissing}
                    mode={p.mode}
                    tried={tried}
                    onPick={(m) => onMode(p.id, m)}
                  />
                </div>
              )}
              {extra?.(p)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// with more than one account by UPI: shows this box's QR in the spot, or says it's the one shown
export function ShowQrButton({ shown, onShow }: { shown: boolean; onShow: () => void }) {
  const t = useTranslations("transactions.chat");
  // always a button: a QR icon and Show QR code (Showing on the one whose QR is in the spot), taking whatever width is left in its row; filled while it's this one's QR in the spot
  return (
    <button
      type="button"
      aria-pressed={shown}
      onClick={onShow}
      className={cn(
        "inline-flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-control border border-chestnut px-3 text-xs font-semibold transition-colors",
        shown ? "bg-chestnut text-ivory" : "bg-ivory text-chestnut hover:bg-chestnut/[0.06]",
      )}
    >
      <QrCode className="size-4 shrink-0" aria-hidden />
      {shown ? t("qrShown") : t("showQr")}
    </button>
  );
}

// Auto (a payment's): fills the boxes from what each holds, cash first; typing turns it off
export function AutoSwitch({ on, set }: { on: boolean; set: (on: boolean) => void }) {
  const t = useTranslations("transactions.salary");
  return (
    <span className="inline-flex items-center justify-end gap-1.5 text-xs font-semibold">
      {t("table.auto")}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={t("table.auto")}
        onClick={() => set(!on)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          on ? "bg-chestnut" : "bg-chestnut/25",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-ivory shadow transition-all",
            on ? "left-4.5" : "left-0.5",
          )}
        />
      </button>
    </span>
  );
}

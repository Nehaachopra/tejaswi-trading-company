"use client";

import { Check, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { FieldMessage, useNudge } from "~/components/ui/field-message";
import { NumberInput } from "~/components/ui/number-input";
import { cn } from "~/lib/utils";

// how many: − and + at the two ends, the number between, chestnut (empty until typed; never above `max`); `autoFocus`:
// the cursor starts in it when its card opens
export function QuantityBox({
  value,
  onChange,
  max,
  label,
  autoFocus = false,
  min = 1,
  belowNote,
}: {
  value: string;
  onChange: (v: string) => void;
  max: number;
  label: string;
  autoFocus?: boolean;
  // the fewest it can be (an edit: what the sale had), and the warning when it's pushed under that
  min?: number;
  belowNote?: React.ReactNode;
}) {
  const t = useTranslations("transactions.sale");
  const quantity = Number(value) || 0;
  const set = (n: number) => onChange(String(Math.min(max, Math.max(min, n))));
  // the amber warnings, each gone after a while: pushed past what's free (+ at it, or more typed: cut to it), and
  // pushed under the fewest (− at it, or less typed: raised to it)
  const over = useNudge();
  const below = useNudge();
  const warnBelow = () => {
    over.clear();
    if (belowNote) below.nudge();
  };
  const warnOver = () => {
    below.clear();
    over.nudge();
  };
  // with a warning to give, − stays live at the fewest and + at the most, to give it
  const lessOff = belowNote ? quantity < 1 : quantity <= min;
  const moreOff = max <= 0;
  return (
    <span className="flex w-full min-w-0 flex-col gap-1">
      <span className="flex min-h-11 w-full items-center justify-between rounded-control bg-chestnut text-ivory">
        <button
          type="button"
          aria-label={`${t("less")}: ${label}`}
          disabled={lessOff}
          onClick={() => {
            over.clear();
            if (quantity <= min) warnBelow();
            else set(quantity - 1);
          }}
          className="grid h-11 w-8 shrink-0 place-items-center disabled:opacity-40"
        >
          <Minus className="size-4" aria-hidden />
        </button>
        <NumberInput
          autoFocus={autoFocus}
          value={value}
          maxDigits={5}
          placeholder="0"
          onChange={(v) => {
            const typed = v.replace(/^0+/, "");
            if (Number(typed) > max) warnOver();
            // (under the fewest is left alone while typing: a larger number passes through smaller ones, 10 → 1 → 12)
            else below.clear();
            onChange(Number(typed) > max ? String(max) : typed);
          }}
          // an edit, on leaving the box: under the fewest is raised to it, with the warning when a smaller number was
          // typed (left empty: back to it, quietly)
          onBlur={() => {
            if (!belowNote || quantity >= min) return;
            if (quantity > 0) warnBelow();
            set(min);
          }}
          aria-label={label}
          className="tabular w-full min-w-0 flex-1 bg-transparent text-center text-base font-bold caret-ivory outline-none placeholder:text-ivory/45"
        />
        <button
          type="button"
          aria-label={`${t("more")}: ${label}`}
          disabled={moreOff}
          onClick={() => (quantity >= max ? warnOver() : (below.clear(), set(quantity + 1)))}
          className="grid h-11 w-9 shrink-0 place-items-center disabled:opacity-40"
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </span>
      {over.shown > 0 && (
        <FieldMessage key={`over${over.shown}`} tone="warning" className="mt-0">
          {t("onlyAvailable", { n: max.toLocaleString("en-IN") })}
        </FieldMessage>
      )}
      {below.shown > 0 && (
        <FieldMessage key={`below${below.shown}`} tone="warning" className="mt-0">
          {belowNote}
        </FieldMessage>
      )}
    </span>
  );
}

// how many leave a godown: − and + at the ends, the number between; soft-edged until it has a number, then chestnut
export function GodownStepper({
  value,
  onChange,
  max,
  disabled,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  max: number;
  disabled: boolean;
  label: string;
}) {
  const t = useTranslations("transactions.sale");
  const n = Number(value) || 0;
  const set = (next: number) => onChange(next <= 0 ? "" : String(Math.min(max, next)));
  return (
    <span
      className={cn(
        "flex min-h-10 w-[7.5rem] items-center justify-between rounded-control font-bold",
        n > 0 ? "bg-chestnut text-ivory" : "shadow-[0_0_5px_0] shadow-chestnut/40",
      )}
    >
      <button
        type="button"
        aria-label={`${t("less")}: ${label}`}
        disabled={disabled || n <= 0}
        onClick={() => set(n - 1)}
        className="grid h-10 w-8 shrink-0 place-items-center disabled:opacity-35"
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <NumberInput
        value={value}
        maxDigits={5}
        placeholder="0"
        disabled={disabled}
        onChange={(v) => {
          const typed = Number(v.replace(/^0+/, "")) || 0;
          set(Math.min(typed, max));
        }}
        aria-label={label}
        className={cn(
          "tabular w-full min-w-0 flex-1 bg-transparent text-center text-base outline-none placeholder:opacity-45",
          n > 0 && "caret-ivory",
        )}
      />
      <button
        type="button"
        aria-label={`${t("more")}: ${label}`}
        disabled={disabled || n >= max}
        onClick={() => set(n + 1)}
        className="grid h-10 w-8 shrink-0 place-items-center disabled:opacity-35"
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </span>
  );
}

// what's left to place, as a payment's meter: the label and a big figure over a thin bar, a rice sack riding the end of
// what's filled; done: green with a tick and All placed; past the quantity: red
export function SackMeter({
  left,
  share,
  done,
  label,
}: {
  left: number;
  share: number;
  done: boolean;
  label: string;
}) {
  const t = useTranslations("transactions.sale");
  const over = left < 0;
  const fill = over ? 100 : Math.max(0, Math.min(100, share));
  return (
    <div className="tabular mb-5 mt-4 flex min-w-0 flex-col gap-3">
      <div className={cn("flex items-baseline justify-between gap-3", over && "text-danger")}>
        <span className="text-sm">{label}</span>
        {done ? (
          <span className="flex items-center gap-1.5 font-heading text-lg font-bold text-success">
            <Check className="size-4" strokeWidth={2.5} aria-hidden />
          </span>
        ) : (
          <span className="font-heading text-2xl font-bold leading-none">
            {over ? t("tooMany", { n: -left }) : left.toLocaleString("en-IN")}
          </span>
        )}
      </div>
      <div className="relative py-1.5">
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fill)}
          className="h-1.5 overflow-hidden rounded-full bg-chestnut/10"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300",
              over ? "bg-danger" : done ? "bg-success" : "bg-chestnut",
            )}
            style={{ width: `${fill}%` }}
          />
        </div>
        <span
          aria-hidden
          className="absolute top-1/2 -translate-x-1/2 -translate-y-[70%] transition-[left] duration-300"
          style={{ left: `clamp(16px, ${fill}%, calc(100% - 16px))` }}
        >
          <RiceSack />
        </span>
      </div>
    </div>
  );
}

// an open jute rice sack: a woven tan body with corner ears, a rolled rim, white rice heaped on top, a thin chestnut
// edge
function RiceSack() {
  const weave = useId();
  return (
    <svg viewBox="0 0 32 32" className="size-8 drop-shadow-[0_1px_1.5px_rgba(60,25,10,0.4)]">
      <defs>
        <pattern id={weave} width="2.4" height="2.4" patternUnits="userSpaceOnUse">
          <rect width="2.4" height="2.4" fill="#c49a64" />
          <rect width="1.2" height="1.2" fill="#a97f4c" />
          <rect x="1.2" y="1.2" width="1.2" height="1.2" fill="#b58b56" />
        </pattern>
      </defs>
      <path
        d="M6 12C5 18 3.4 24 2.5 29.2L6.5 28Q16 30.2 25.5 28L29.5 29.2C28.6 24 27 18 26 12Z"
        fill={`url(#${weave})`}
        stroke="currentColor"
        strokeWidth=".9"
        strokeLinejoin="round"
        className="text-chestnut"
      />
      <path
        d="M6.8 10Q8.6 3.2 16 3.2T25.2 10Q16 7.6 6.8 10Z"
        fill="#fffdf6"
        stroke="currentColor"
        strokeWidth=".9"
        className="text-chestnut"
      />
      <path
        d="M11 7.2l1.2-.4M14.6 5.6l1.2.2M18.4 6.6l1.1.4M13 8.2l1 .1M20.6 8.4l.9.3"
        fill="none"
        stroke="#cfc8b6"
        strokeWidth=".9"
        strokeLinecap="round"
      />
      <path
        d="M4.8 9.2Q16 6.4 27.2 9.2L27.6 13.4Q16 10.6 4.4 13.4Z"
        fill="#b88d58"
        stroke="currentColor"
        strokeWidth=".9"
        strokeLinejoin="round"
        className="text-chestnut"
      />
    </svg>
  );
}

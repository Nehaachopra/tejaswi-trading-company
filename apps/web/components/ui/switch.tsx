"use client";

import { cn } from "~/lib/utils";

// an on/off switch on an ivory surface; `labelledBy` is the id of the words beside it. `small`: sized to sit in a row of
// text (a breakup's TDS row), still easy to tap (its touch area reaches past its edge)
export function Switch({
  on,
  onFlip,
  labelledBy,
  disabled,
  small = false,
}: {
  on: boolean;
  onFlip: (on: boolean) => void;
  labelledBy: string;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onFlip(!on)}
      className={cn(
        "relative shrink-0 rounded-full border-chestnut transition-colors disabled:opacity-70",
        small
          ? "h-5 w-9 border-[1.5px] after:absolute after:-inset-3 after:content-['']"
          : "h-8 w-14 border-2",
        on ? "bg-chestnut" : "bg-transparent",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 -translate-y-1/2 rounded-full transition-all",
          small ? "size-3" : "size-5",
          on
            ? small
              ? "left-[18px] bg-ivory"
              : "left-7 bg-ivory"
            : small
              ? "left-[3px] bg-chestnut"
              : "left-1 bg-chestnut",
        )}
      />
    </button>
  );
}

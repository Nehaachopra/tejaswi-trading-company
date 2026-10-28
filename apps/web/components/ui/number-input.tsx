"use client";

import { useLayoutEffect, useRef } from "react";

// the whole-number part grouped the Indian way: 1,00,000 · 12,34,567
export function groupIndian(digits: string) {
  const d = digits.replace(/^0+(?=\d)/, "");
  if (d.length <= 3) return d;
  const head = d.slice(0, -3).replace(/\B(?=(\d{2})+$)/g, ",");
  return `${head},${d.slice(-3)}`;
}

// a raw value ("125000.5", "-5000") as shown ("1,25,000.5", "-5,000"); a half-typed decimal ("12.") or a lone
// minus stays as typed
const show = (raw: string) => {
  const minus = raw.startsWith("-") ? "-" : "";
  const [int = "", dec] = raw.slice(minus.length).split(".");
  if (int === "" && dec === undefined) return minus;
  return minus + (dec === undefined ? groupIndian(int) : `${groupIndian(int || "0")}.${dec}`);
};

// keep what's typed to digits, one point and up to `decimals` places, and `maxDigits` before the point; with
// `negative`, a minus at the start too
function clean(typed: string, decimals: number, maxDigits: number, negative = false) {
  const minus = negative && typed.trimStart().startsWith("-") ? "-" : "";
  const s = typed.replace(decimals > 0 ? /[^\d.]/g : /\D/g, "");
  const point = s.indexOf(".");
  if (point === -1) return minus + s.slice(0, maxDigits);
  return `${minus}${s.slice(0, point).slice(0, maxDigits)}.${s.slice(point + 1).replace(/\./g, "").slice(0, decimals)}`;
}

// a number field shown with Indian grouping (x,xx,xxx) while typing; the value in and out is the raw number
// as typed, without commas. The caret stays after the same digit as the commas move. With `max`, a larger
// number can't be typed: it becomes the max. With `negative`, it may start with a minus (the keyboard then has one)
export function NumberInput({
  value,
  onChange,
  decimals = 0,
  maxDigits = 12,
  max,
  negative = false,
  placeholder,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "inputMode" | "placeholder"> & {
  value: string;
  onChange: (raw: string) => void;
  decimals?: number;
  maxDigits?: number;
  max?: number;
  negative?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // how many digits (and the point) sat before the caret on the last keystroke
  const caret = useRef<number | null>(null);

  // put the caret back after that many digits in the regrouped text
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || caret.current == null || document.activeElement !== el) return;
    let seen = 0;
    let at = 0;
    while (at < el.value.length && seen < caret.current) {
      if (el.value[at] !== ",") seen++;
      at++;
    }
    el.setSelectionRange(at, at);
    caret.current = null;
  });

  return (
    <input
      {...rest}
      ref={ref}
      value={show(value)}
      // phone number pads have no minus key, so a field that takes one gets the full keyboard
      inputMode={negative ? "text" : decimals > 0 ? "decimal" : "numeric"}
      // a number as the hint is grouped like the value; words ("e.g. 500") are shown as they are
      placeholder={placeholder && /^-?[\d,.]+$/.test(placeholder) ? show(placeholder.replace(/,/g, "")) : placeholder}
      onChange={(e) => {
        const before = e.target.value.slice(0, e.target.selectionStart ?? e.target.value.length);
        const raw = clean(e.target.value, decimals, maxDigits, negative);
        // over the max: the max, with the caret at the end
        if (max != null && Number(raw) > max) {
          caret.current = String(max).length;
          return onChange(String(max));
        }
        caret.current = clean(before, decimals, maxDigits, negative).length;
        onChange(raw);
      }}
    />
  );
}

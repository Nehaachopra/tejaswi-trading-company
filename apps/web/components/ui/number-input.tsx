"use client";

import { useLayoutEffect, useRef } from "react";

// the whole-number part grouped the Indian way: 1,00,000 · 12,34,567
export function groupIndian(digits: string) {
  const d = digits.replace(/^0+(?=\d)/, "");
  if (d.length <= 3) return d;
  const head = d.slice(0, -3).replace(/\B(?=(\d{2})+$)/g, ",");
  return `${head},${d.slice(-3)}`;
}

// a raw value ("125000.5") as shown ("1,25,000.5"); a half-typed decimal ("12.") stays as typed
const show = (raw: string) => {
  const [int = "", dec] = raw.split(".");
  return dec === undefined ? groupIndian(int) : `${groupIndian(int || "0")}.${dec}`;
};

// keep what's typed to digits, one point and up to `decimals` places, and `maxDigits` before the point
function clean(typed: string, decimals: number, maxDigits: number) {
  const s = typed.replace(decimals > 0 ? /[^\d.]/g : /\D/g, "");
  const point = s.indexOf(".");
  if (point === -1) return s.slice(0, maxDigits);
  return `${s.slice(0, point).slice(0, maxDigits)}.${s.slice(point + 1).replace(/\./g, "").slice(0, decimals)}`;
}

// a number field shown with Indian grouping (x,xx,xxx) while typing; the value in and out is the raw number
// as typed, without commas. The caret stays after the same digit as the commas move. With `max`, a larger
// number can't be typed: it becomes the max
export function NumberInput({
  value,
  onChange,
  decimals = 0,
  maxDigits = 12,
  max,
  placeholder,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "inputMode" | "placeholder"> & {
  value: string;
  onChange: (raw: string) => void;
  decimals?: number;
  maxDigits?: number;
  max?: number;
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
      inputMode={decimals > 0 ? "decimal" : "numeric"}
      placeholder={placeholder && show(placeholder)}
      onChange={(e) => {
        const before = e.target.value.slice(0, e.target.selectionStart ?? e.target.value.length);
        const raw = clean(e.target.value, decimals, maxDigits);
        // over the max: the max, with the caret at the end
        if (max != null && Number(raw) > max) {
          caret.current = String(max).length;
          return onChange(String(max));
        }
        caret.current = clean(before, decimals, maxDigits).length;
        onChange(raw);
      }}
    />
  );
}

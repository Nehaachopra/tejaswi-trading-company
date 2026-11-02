"use client";

import { Calendar } from "lucide-react";
import { useLocale } from "next-intl";
import { useRef } from "react";

// a day ("2026-10-30") as read out: "30 October 2026", month names in the app's language
export function dayInWords(day: string, locale: string) {
  return new Date(`${day}T12:00:00+05:30`).toLocaleDateString(`${locale}-IN`, { day: "numeric", month: "long", year: "numeric" });
}

// a date field that reads "30 October 2026" instead of the browser's own digits; the browser's date picker sits
// invisibly over it, so a tap or click opens it. The value in and out is "yyyy-mm-dd". With `calendarLabel` a calendar
// button beside it opens the picker too
export function DateInput({
  value,
  onChange,
  className,
  placeholder,
  calendarLabel,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: string;
  onChange: (day: string) => void;
  calendarLabel?: string;
}) {
  const locale = useLocale();
  const picker = useRef<HTMLInputElement>(null);
  const field = (
    <span className={`relative flex items-center ${className ?? ""}`}>
      <span className={value ? "" : "text-chestnut/50"}>{value ? dayInWords(value, locale) : placeholder}</span>
      <input
        {...rest}
        ref={picker}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // desktop browsers open the picker only from its icon, so open it on any click
        onClick={(e) => {
          try {
            e.currentTarget.showPicker();
          } catch {
            // no showPicker: the browser opens it itself
          }
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </span>
  );
  if (!calendarLabel) return field;
  return (
    <span className="flex items-center gap-2">
      <span className="min-w-0 flex-1">{field}</span>
      <button
        type="button"
        aria-label={calendarLabel}
        onClick={() => {
          try {
            picker.current?.showPicker();
          } catch {
            picker.current?.focus();
          }
        }}
        className="grid size-11 shrink-0 place-items-center rounded-control bg-chestnut text-ivory transition-opacity hover:opacity-90"
      >
        <Calendar className="size-5" aria-hidden />
      </button>
    </span>
  );
}

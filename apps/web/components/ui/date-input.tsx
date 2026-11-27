"use client";

import { Calendar as CalendarIcon } from "lucide-react";
import { useLocale } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Calendar } from "./calendar";

// a day ("2026-10-30") as read out: "30 October 2026", month names in the app's language
export function dayInWords(day: string, locale: string) {
  return new Date(`${day}T12:00:00+05:30`).toLocaleDateString(`${locale}-IN`, { day: "numeric", month: "long", year: "numeric" });
}

// a date field that reads "30 October 2026" instead of the browser's own digits; the browser's date picker sits
// invisibly over it, so a tap or click opens it. The value in and out is "yyyy-mm-dd". With `calendarLabel` a calendar
// button beside it opens the picker too. With `calendar` the app's own Calendar opens under the field instead of the
// browser's picker
export function DateInput({
  value,
  onChange,
  className,
  placeholder,
  calendarLabel,
  calendar = false,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: string;
  onChange: (day: string) => void;
  calendarLabel?: string;
  calendar?: boolean;
}) {
  const locale = useLocale();
  const picker = useRef<HTMLInputElement>(null);
  if (calendar) return <CalendarField value={value} onChange={onChange} className={className} placeholder={placeholder} calendarLabel={calendarLabel} {...rest} />;
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
        <CalendarIcon className="size-5" aria-hidden />
      </button>
    </span>
  );
}

// the field with the app's Calendar: the day in words with a calendar mark, a tap opens the month under it; a day
// picked closes it, as do Escape and a tap outside. The cursor comes back to the field
function CalendarField({
  value,
  onChange,
  className,
  placeholder,
  calendarLabel,
  min,
  max,
  id,
  disabled,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: string;
  onChange: (day: string) => void;
  calendarLabel?: string;
}) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <span ref={box} className="relative block">
      <button
        ref={button}
        type="button"
        id={id}
        disabled={disabled}
        aria-expanded={open}
        aria-invalid={rest["aria-invalid"]}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center justify-between gap-3 text-left ${className ?? ""}`}
      >
        <span className={value ? "" : "text-chestnut/50"}>{value ? dayInWords(value, locale) : placeholder}</span>
        <CalendarIcon className="size-5 shrink-0" aria-hidden />
      </button>
      {open && (
        <span className="absolute left-0 top-full z-30 mt-2 block w-full max-w-80">
          <Calendar
            value={value}
            min={typeof min === "string" ? min : undefined}
            max={typeof max === "string" ? max : undefined}
            label={calendarLabel ?? ""}
            onPick={(day) => {
              onChange(day);
              setOpen(false);
              button.current?.focus();
            }}
          />
        </span>
      )}
    </span>
  );
}

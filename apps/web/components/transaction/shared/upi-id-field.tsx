"use client";

import { Check, Pencil } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { FieldMessage } from "~/components/ui/field-message";
import { Reveal } from "~/components/ui/reveal";

import { fieldRow, input, pickRow } from "./form-basics";

// what the box needs: what's typed, whether it's a UPI ID at all and one a UPI app gives out, whether it was left (its
// mistakes show then), whether it's being changed, and whether Next was pressed
export type UpiIdState = {
  typed: string;
  setTyped: (v: string) => void;
  shapeOk: boolean;
  ok: boolean;
  left: boolean;
  setLeft: (left: boolean) => void;
  editing: boolean;
  setEditing: (editing: boolean) => void;
  tried: boolean;
};

// the payee's UPI ID, asked when they're paid by UPI and have none saved (a payment, a purchase): named for who's paid
// (Supplier UPI ID …). In an account card (`row`): its name and a pen until the pen is tapped (with the ID once Saved);
// then the box with Save under it (`tick`: a ✓ right beside the box instead, a payment's). Out of a card: the box at once
export function UpiIdField({ show, label, row = false, tick = false, state }: { show: boolean; label: string; row?: boolean; tick?: boolean; state: UpiIdState }) {
  const t = useTranslations("transactions.payment.form");
  const { typed, setTyped, shapeOk, ok, left, setLeft, editing, setEditing, tried } = state;
  const bad = (left || tried) && typed.trim() !== "" && !ok;
  // each Save / ✓ tap brings what's wrong back (it hides itself after a while)
  const [recheck, setRecheck] = useState(0);
  const keep = () => {
    setLeft(true);
    setRecheck((n) => n + 1);
    if (ok) setEditing(false);
  };
  const box = (
    <input
      autoFocus={editing}
      type="text"
      inputMode="email"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      value={typed}
      maxLength={255}
      onChange={(e) => {
        setLeft(false);
        setEditing(true);
        setTyped(e.target.value.toLowerCase().replace(/[^a-z0-9.@_-]/g, ""));
      }}
      // its mistakes show once it's left; Enter keeps it
      onBlur={() => setLeft(true)}
      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), keep())}
      placeholder="name@bank"
      aria-invalid={bad || undefined}
      className={input(bad)}
    />
  );
  return (
    <Reveal follow show={show} gap="0px">
      {row && !editing ? (
        // its name, the ID once Saved, and the pen that brings the box
        <div className={pickRow}>
          <span>{label}</span>
          <span className="flex min-h-12 min-w-0 items-center justify-end gap-2 px-3.5">
            {ok && <span className="truncate text-sm font-semibold">{typed.trim().toLowerCase()}</span>}
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={t("editUpi")}
              className="-mr-2.5 grid size-9 shrink-0 place-items-center rounded-control hover:bg-chestnut/[0.08]"
            >
              <Pencil className="size-4" aria-hidden />
            </button>
          </span>
        </div>
      ) : (
        // the box, then Save under it (or the ✓ beside it)
        <label className={row ? fieldRow : "flex flex-col gap-2 text-xs font-semibold"}>
          <span>{label}</span>
          <span className="flex min-w-0 items-center gap-2">
            {box}
            {tick && (
              <button
                type="button"
                data-recheck
                // a tap keeps the box from losing focus first
                onMouseDown={(e) => e.preventDefault()}
                onClick={keep}
                aria-label={t("saveUpi")}
                className="grid size-11 shrink-0 place-items-center rounded-control bg-chestnut text-ivory"
              >
                <Check className="size-5" strokeWidth={2.5} aria-hidden />
              </button>
            )}
          </span>
          {bad && (
            <FieldMessage key={recheck} className="mt-0">
              {shapeOk ? t("payeeUpiHandle", { handle: `@${typed.trim().split("@")[1]}` }) : t("payeeUpiBad")}
            </FieldMessage>
          )}
          {/* Save, under the box: the full width on a phone, at the right edge wider */}
          {!tick && (
            <button
              type="button"
              data-recheck
              // a tap keeps the box from losing focus first
              onMouseDown={(e) => e.preventDefault()}
              onClick={keep}
              disabled={typed.trim() === ""}
              className="flex min-h-11 w-full items-center justify-center rounded-control bg-chestnut px-4 text-sm font-semibold text-ivory disabled:opacity-40 sm:w-auto sm:justify-self-end"
            >
              {t("saveUpi")}
            </button>
          )}
        </label>
      )}
    </Reveal>
  );
}

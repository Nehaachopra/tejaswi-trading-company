"use client";

import { useEffect, useId } from "react";

import { Spinner } from "./spinner";

// asks before something that can't be undone; Cancel has the focus, so Enter never destroys by accident
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();

  // Escape cancels, unless the action is already running
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      {/* the scrim: a tap on it cancels */}
      <button type="button" aria-label={cancelLabel} tabIndex={-1} onClick={() => !busy && onCancel()} className="absolute inset-0 bg-black/50" />

      {/* the question, and the two answers */}
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="on-ivory relative flex w-full max-w-sm flex-col gap-5 rounded-control bg-ivory p-6 text-chestnut"
      >
        <div>
          <h2 id={titleId} className="font-heading text-2xl font-bold">
            {title}
          </h2>
          <p id={bodyId} className="mt-1 text-sm text-chestnut/80">
            {body}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            disabled={busy}
            className="min-h-12 rounded-control border border-chestnut/60 font-medium hover:border-chestnut disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy}
            className="flex min-h-12 items-center justify-center gap-2 rounded-control bg-danger font-heading text-lg font-bold text-ivory aria-busy:opacity-80"
          >
            {busy && <Spinner className="size-5" />}
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

"use client";

import { useEffect, useId } from "react";

import { Spinner } from "./icons/spinner";

// asks before something that can't be undone; Cancel has the focus, so Enter never destroys by accident. A plain one
// (a question, nothing destroyed) has a chestnut answer, and that answer has the focus
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  busy,
  onConfirm,
  onCancel,
  tone = "danger",
  extra,
}: {
  // a plain one's second answer, under the first and as strong (New product / Change all, then Undo below)
  extra?: { label: string; busy: boolean; onClick: () => void };
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  tone?: "danger" | "plain";
}) {
  const plain = tone === "plain";
  const titleId = useId();
  const bodyId = useId();

  // Escape cancels, unless the action is already running
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && !extra?.busy && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, extra?.busy, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      {/* the scrim: a tap on it cancels */}
      <button
        type="button"
        aria-label={cancelLabel}
        tabIndex={-1}
        onClick={() => !busy && !extra?.busy && onCancel()}
        className="absolute inset-0 bg-black/50"
      />

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
          <div id={bodyId} className="mt-1 text-sm text-chestnut/80">
            {body}
          </div>
        </div>
        {/* the two answers, each with room inside; a plain one's stacked, its answer on top, so long labels never squeeze */}
        <div className={plain ? "flex flex-col-reverse gap-2" : "grid grid-cols-2 gap-2"}>
          <button
            type="button"
            autoFocus={!plain}
            onClick={onCancel}
            disabled={busy || extra?.busy}
            className="min-h-12 rounded-control border border-chestnut/60 px-4 py-2 font-medium leading-tight hover:border-chestnut disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          {extra && (
            <button
              type="button"
              onClick={extra.onClick}
              disabled={busy || extra.busy}
              aria-busy={extra.busy}
              className="flex min-h-12 items-center justify-center gap-2 rounded-control bg-chestnut px-4 py-2 font-heading text-lg font-bold leading-tight text-ivory disabled:not-aria-busy:opacity-40 aria-busy:opacity-80"
            >
              {extra.busy && <Spinner className="size-5" />}
              {extra.label}
            </button>
          )}
          <button
            type="button"
            autoFocus={plain}
            onClick={onConfirm}
            disabled={busy || extra?.busy}
            aria-busy={busy}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-control px-4 py-2 font-heading text-lg font-bold leading-tight text-ivory aria-busy:opacity-80 ${plain ? "bg-chestnut" : "bg-danger"}`}
          >
            {busy && <Spinner className="size-5" />}
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

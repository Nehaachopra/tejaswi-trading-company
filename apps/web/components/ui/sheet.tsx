"use client";

import { ChevronDown, ChevronRight, X } from "lucide-react";
import { useEffect, useId } from "react";

// every sheet and drawer follows one rule: up from the bottom on phones, in from the right from 640px;
// ivory with chestnut ink, over a scrim. The close button and the arrow tab close it; a tap on the scrim
// and Escape only close a sheet that holds nothing to lose (`dismissible`, e.g. the More menu)
export function Sheet({
  open,
  title,
  closeLabel,
  onClose,
  visual,
  actions,
  dismissible = false,
  children,
}: {
  open: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  // shown in place of the title (the logo, a product's pack sizes); the title is then read out but not shown
  visual?: React.ReactNode;
  // small buttons shown in place of the close button; the arrow tab on the edge still closes the sheet
  actions?: React.ReactNode;
  dismissible?: boolean;
  children: React.ReactNode;
}) {
  const titleId = useId();

  // the page behind doesn't scroll while a sheet is open; padding takes the scrollbar's place so nothing shifts
  useEffect(() => {
    if (!open) return;
    const { overflow, paddingRight } = document.body.style;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
    };
  }, [open]);

  // Escape closes a dismissible sheet while it's open
  useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end">
      {/* the scrim: a tap on it closes only a dismissible sheet, so a half-filled form is never lost */}
      <div aria-hidden onClick={dismissible ? onClose : undefined} className="absolute inset-0 bg-black/50" />

      {/* the panel: title and close button, then the content (which scrolls inside it) */}
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="on-ivory relative flex max-h-[92dvh] w-full animate-sheet-up flex-col rounded-t-control bg-ivory text-chestnut sm:h-full sm:max-h-none sm:max-w-md sm:animate-sheet-left sm:rounded-none sm:rounded-l-control"
      >
        {/* the close tab on the edge it came from: the middle of the top edge pointing down on phones,
            the middle of the left edge pointing right from 640px */}
        <button
          type="button"
          aria-label={closeLabel}
          // the only way to close when the header holds actions, so then it's reachable by keyboard too
          tabIndex={actions ? 0 : -1}
          onClick={onClose}
          className="absolute -top-6 left-1/2 grid h-6 w-16 -translate-x-1/2 place-items-center rounded-t-control bg-ivory text-chestnut/80 hover:text-chestnut sm:top-1/2 sm:-left-6 sm:h-16 sm:w-6 sm:translate-x-0 sm:-translate-y-1/2 sm:rounded-none sm:rounded-l-control"
        >
          <ChevronDown className="size-5 sm:hidden" aria-hidden />
          <ChevronRight className="hidden size-5 sm:block" aria-hidden />
        </button>

        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-chestnut/15 px-5 py-4">
          {visual ? (
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="sr-only">
                {title}
              </h2>
              {visual}
            </div>
          ) : (
            <h2 id={titleId} className="font-heading text-2xl font-bold">
              {title}
            </h2>
          )}
          {actions ? (
            <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
          ) : (
            <button
              type="button"
              aria-label={closeLabel}
              onClick={onClose}
              className="grid size-11 shrink-0 place-items-center rounded-control border border-chestnut/60 hover:border-chestnut"
            >
              <X className="size-5" aria-hidden />
            </button>
          )}
        </header>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </section>
    </div>
  );
}

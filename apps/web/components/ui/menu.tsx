"use client";

import { useEffect, useId, useRef, useState } from "react";

import { cn } from "~/lib/utils";

// a button that opens a small ivory panel below it, on an ivory surface (the header) or the chestnut page;
// a tap outside, Escape or picking an item closes it
export function Menu({
  label,
  trigger,
  triggerClassName,
  surface = "ivory",
  align = "right",
  plain = false,
  disabled,
  children,
}: {
  label: string;
  trigger: React.ReactNode;
  triggerClassName?: string;
  surface?: "ivory" | "chestnut";
  align?: "left" | "right";
  // an icon button with no edge (the ⋯ menus); dropdown fields keep theirs
  plain?: boolean;
  disabled?: boolean;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const close = () => setOpen(false);

  // closing: a tap anywhere else, or Escape
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      {/* the trigger */}
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex min-h-11 items-center justify-center gap-1.5 rounded-control border transition-colors disabled:opacity-40",
          plain
            ? cn("border-transparent", surface === "ivory" ? "text-chestnut hover:bg-chestnut/[0.08]" : "text-ivory hover:bg-ivory/10", open && (surface === "ivory" ? "bg-chestnut/[0.08]" : "bg-ivory/10"))
            : surface === "ivory"
              ? cn("border-chestnut/60 text-chestnut hover:border-chestnut", open && "border-chestnut")
              : cn("border-ivory/40 text-ivory hover:border-ivory/70", open && "border-ivory"),
          triggerClassName,
        )}
      >
        {trigger}
      </button>

      {/* the panel: an ivory card under the trigger, lined up with its left or right edge */}
      {open && (
        <div
          id={panelId}
          className={cn(
            "on-ivory absolute top-full z-40 mt-2 max-h-80 min-w-56 overflow-y-auto rounded-control border border-chestnut/25 bg-ivory p-1.5 text-chestnut",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

// one choice inside a Menu panel
export function MenuItem({
  selected,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "flex min-h-11 w-full items-center gap-2 rounded-control px-3 text-left text-sm hover:bg-chestnut/[0.06] disabled:opacity-40",
        selected && "bg-chestnut font-medium text-ivory hover:bg-chestnut",
        className,
      )}
    />
  );
}

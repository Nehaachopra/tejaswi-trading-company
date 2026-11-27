"use client";

import { type ReactNode, useState } from "react";

import { cn } from "~/lib/utils";

// an action that can't be taken here (Edit on a sale whose GST month is filed…): looks greyed but still answers a tap,
// its reason in a small box under it (a hover shows it too); tapped again, or tapped away, it goes
export function BlockedButton({ className, reason, children }: { className: string; reason: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button
        type="button"
        aria-disabled
        aria-expanded={open}
        title={reason}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className={cn(className, "opacity-60")}
      >
        {children}
      </button>
      {open && (
        <span role="status" className="absolute right-0 top-full z-30 mt-1.5 w-64 rounded-control bg-ivory p-2.5 text-xs font-semibold text-chestnut shadow-md">
          {reason}
        </span>
      )}
    </span>
  );
}

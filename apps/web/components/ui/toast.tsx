"use client";

import { CircleAlert, CircleCheck, X } from "lucide-react";
import { toast as sonner, Toaster as SonnerToaster } from "sonner";

import { cn } from "~/lib/utils";

type Tone = "success" | "error";

// success leaves on its own; an error stays until it's dismissed, so nobody misses it
const SUCCESS_MS = 4000;

// solid green or red with ivory words and an icon, so the message never rests on colour alone
function Toast({ id, tone, message }: { id: string | number; tone: Tone; message: string }) {
  const Icon = tone === "success" ? CircleCheck : CircleAlert;
  return (
    <div
      className={cn(
        "flex min-h-13 w-full items-center gap-2.5 rounded-control pl-4 pr-1 text-sm font-semibold text-ivory",
        tone === "success" ? "bg-success" : "bg-danger",
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      <span className="flex-1 py-3.5">{message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => sonner.dismiss(id)}
        className="flex size-11 shrink-0 items-center justify-center rounded-control"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

// the result of an action: repeat what the button said ("Save product" → "Product saved");
// an error says what went wrong and what to do
export const toast = {
  success: (message: string) =>
    sonner.custom((id) => <Toast id={id} tone="success" message={message} />, { duration: SUCCESS_MS }),
  error: (message: string) =>
    sonner.custom((id) => <Toast id={id} tone="error" message={message} />, { duration: Infinity }),
};

// just below the 64px header: full width on phones, top-right from 600px
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      offset={{ top: 64 + 16, right: 24 }}
      mobileOffset={{ top: 64 + 12, left: 16, right: 16 }}
      gap={8}
      visibleToasts={3}
    />
  );
}

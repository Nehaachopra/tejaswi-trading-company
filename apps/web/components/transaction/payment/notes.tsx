"use client";

import { Note } from "~/components/ui/note";
import { cn } from "~/lib/utils";
import { usePaymentEntry } from "./state";

// something the server couldn't answer: shared with the receipt form
export { FailNote } from "../shared/bank-mode";

// why an amount stopped at its most: a warning under that field (the amount stays at the most)
export function CapWarning({ at: key, className }: { at: string; className?: string }) {
  const { capNote } = usePaymentEntry();
  if (capNote?.key !== key) return null;
  return <Note className={cn("text-amber-700", className)}>{capNote.text}</Note>;
}

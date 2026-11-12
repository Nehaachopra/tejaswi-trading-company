"use client";

import { FieldMessage } from "~/components/ui/field-message";
import { cn } from "~/lib/utils";
import { usePaymentEntry } from "./state";

// something the server couldn't answer: shared with the receipt form
export { FailNote } from "../shared/bank-mode";

// why an amount stopped at its most: a warning under that field (the amount stays at the most)
export function CapWarning({ at: key, className }: { at: string; className?: string }) {
  const { capNote } = usePaymentEntry();
  if (capNote?.key !== key) return null;
  return (
    <FieldMessage tone="warning" className={cn("mt-0", className)}>
      {capNote.text}
    </FieldMessage>
  );
}

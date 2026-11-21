"use client";

import { DueStage as SharedStage } from "../shared/due-stage";
import { useSaleEntry } from "./state";

// a credit sale's due stage, on the shared one (as a purchase's): the bill, the old due, the due and the credit period
export function DueStage() {
  const { total, oldDue, dueNow, creditDays, setCreditDays, tried } = useSaleEntry();
  return <SharedStage bill={total} oldDue={oldDue} due={dueNow} days={creditDays} setDays={setCreditDays} tried={tried} />;
}

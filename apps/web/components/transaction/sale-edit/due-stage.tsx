"use client";

import { DueStage as SharedStage } from "../shared/due-stage";
import { useSaleEdit } from "./state";

// an edit on credit, as a credit sale's due stage: the bill, the old due, what they'll owe (less what was paid towards
// this bill) and the credit period
export function DueStage() {
  const { t, total, oldDue, creditDue, editPaid, creditDays, setCreditDays, tried } = useSaleEdit();
  return (
    <SharedStage
      bill={total}
      oldDue={oldDue}
      // what the sale already received, taken off (none: left out)
      paid={editPaid > 0 ? { label: t("edit.originalReceived"), amount: editPaid } : null}
      due={creditDue}
      days={creditDays}
      setDays={setCreditDays}
      tried={tried}
    />
  );
}

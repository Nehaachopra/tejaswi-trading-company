"use client";

import { LeftRow } from "../shared/payment-stage";
import { usePaymentEntry } from "./state";

// an edited payment's Original payment: what was handed over as first saved, opened by the arrow beside the Amount
// stage's box (none on a new payment)
export function useOriginalPayment() {
  const { t, originalPaid } = usePaymentEntry();
  if (originalPaid === null) return undefined;
  return {
    title: t("originalPayment"),
    box: <LeftRow label={t("originalPayment")} amount={originalPaid} />,
  };
}

"use client";

import { Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { useSaleForReturn } from "~/providers/sale-return";

import { indiaDay } from "../../account/balance";

// whole days from one YYYY-MM-DD to another
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

// a sale's Return button (the admin's, in History, beside Edit): only while something of it can still come back. A tap
// first asks, saying how long ago it was sold; Yes opens the return form
export function ReturnButton({ id, saleDay, className }: { id: string; saleDay: string; className: string }) {
  const t = useTranslations("transactions.saleReturn");
  const router = useRouter();
  const { sale } = useSaleForReturn(id);
  const [asking, setAsking] = useState(false);
  if (!sale || sale.returnBlockedBy) return null;
  const days = daysBetween(saleDay, indiaDay(new Date()));
  return (
    <>
      <button type="button" onClick={() => setAsking(true)} className={className}>
        <Undo2 className="size-4" aria-hidden /> {t("returnSale")}
      </button>
      <ConfirmDialog
        open={asking}
        tone="plain"
        title={t("ask.title")}
        body={t("ask.body", { days })}
        confirmLabel={t("ask.yes")}
        cancelLabel={t("ask.no")}
        busy={false}
        onConfirm={() => router.push(`/history/${id}/return`)}
        onCancel={() => setAsking(false)}
      />
    </>
  );
}

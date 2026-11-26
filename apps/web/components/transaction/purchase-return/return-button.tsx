"use client";

import { Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "~/components/ui/confirm-dialog";
import { usePurchaseForReturn } from "~/providers/purchase-return";

import { indiaDay } from "../../account/balance";

// a return within this many days of the purchase opens straight away; an older one asks first
const ASK_AFTER_DAYS = 7;

// whole days from one YYYY-MM-DD to another
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

// a purchase's Return button (the admin's, in History), as a sale's: only while something of it can still go back. A
// tap opens the return form; a purchase more than 7 days old first asks, saying how long ago it was bought
export function PurchaseReturnButton({ id, purchaseDay, className }: { id: string; purchaseDay: string; className: string }) {
  const t = useTranslations("transactions.purchaseReturn");
  const router = useRouter();
  const { purchase } = usePurchaseForReturn(id);
  const [asking, setAsking] = useState(false);
  if (!purchase || purchase.returnBlockedBy) return null;
  const days = daysBetween(purchaseDay, indiaDay(new Date()));
  const open = () => router.push(`/history/${id}/return`);
  return (
    <>
      <button type="button" onClick={() => (days > ASK_AFTER_DAYS ? setAsking(true) : open())} className={className}>
        <Undo2 className="size-4" aria-hidden /> {t("returnPurchase")}
      </button>
      {/* the shared yes / no popup: No and Yes side by side */}
      <ConfirmDialog
        open={asking}
        title={t("ask.title")}
        body={t("ask.body", { days })}
        confirmLabel={t("ask.yes")}
        cancelLabel={t("ask.no")}
        busy={false}
        onConfirm={open}
        onCancel={() => setAsking(false)}
      />
    </>
  );
}

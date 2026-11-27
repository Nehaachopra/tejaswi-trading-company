"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { PaymentProvider } from "~/providers/payment";
import { type PaymentForEdit, usePaymentForEdit, useSavePaymentEdit } from "~/providers/payment-edit";

import { EntryNote } from "../../../transaction/shared/entry-frame";
import { PaymentEntryView } from "../../../transaction/payment/form";
import { PaymentEntryProvider, usePaymentEntryState } from "../../../transaction/payment/state";

// /history/[id]/edit for a payment, from Edit payment on its voucher (the admin's): the payment form itself, every
// stage borrowed, opened on the saved payment. What it was paid for (and who was paid, under a head with TDS) stays;
// Paid to, GST, loan terms, the amount with where it's paid from, and the details can change, the day within its own
// month. Saved over it and on to Edit successful; discarding starts it again from the saved payment
export function PaymentEditForm({ id }: { id: string }) {
  const [round, setRound] = useState(0);
  return <EditLoader key={round} id={id} onDiscard={() => setRound((r) => r + 1)} />;
}

// waits for the payment, then opens the form (cash and the banks load in the form, as a new payment's)
function EditLoader({ id, onDiscard }: { id: string; onDiscard: () => void }) {
  const te = useTranslations("history.payment.edit");
  const th = useTranslations("history");
  const read = usePaymentForEdit(id);
  if (read.loading)
    return (
      <EntryNote title={te("title")} loading>
        {te("loading")}
      </EntryNote>
    );
  if (read.loadFailed || !read.data)
    return (
      <EntryNote title={te("title")} failed onRetry={read.retry}>
        {te("loadFailed")}
      </EntryNote>
    );
  // one that can't be edited says why
  if (read.data.editBlockedBy)
    return <EntryNote title={te("title")}>{th(`payment.editBlocked.${read.data.editBlockedBy}`)}</EntryNote>;
  return (
    <PaymentProvider>
      <EditEntry saved={read.data} onDiscard={onDiscard} />
    </PaymentProvider>
  );
}

// the payment form's own state, started from the saved payment, with the edit's save in place of a new one's
function EditEntry({ saved, onDiscard }: { saved: PaymentForEdit; onDiscard: () => void }) {
  const te = useTranslations("history.payment.edit");
  const router = useRouter();
  const { saveEdit, saving, saved: done } = useSavePaymentEdit();
  const state = usePaymentEntryState({
    isAdmin: true,
    onDiscard,
    edit: {
      saved,
      saving,
      done,
      save: async (payment) => {
        await saveEdit({ transactionId: saved.transactionId, payment });
        router.replace(`/history/${saved.transactionId}/edit/done`);
      },
    },
  });
  return (
    <PaymentEntryProvider value={state}>
      <PaymentEntryView title={te("title")} />
    </PaymentEntryProvider>
  );
}

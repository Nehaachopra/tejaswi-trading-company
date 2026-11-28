"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { SalaryProvider } from "~/providers/salary";
import { type SalaryForEdit, useSalaryForEdit, useSaveSalaryEdit } from "~/providers/salary-edit";

import { EntryNote } from "../../../transaction/shared/entry-frame";
import { SalaryEntryView } from "../../../transaction/payment/salary/form";
import { SalaryEntryProvider, useSalaryEntryState } from "../../../transaction/payment/salary/state";

// /history/[id]/edit for a salary or an advance, from Edit payment on its screen (the admin's): the salary stages
// themselves, opened on the saved one, as Edit payment is the payment form. What it was paid for and the employee stay;
// the months (and the advance set off), where it's paid from, and the details can change, the day within its own month.
// Saved over it and on to Edit successful; discarding starts it again from the saved one
export function SalaryEditForm({ id }: { id: string }) {
  const [round, setRound] = useState(0);
  return <EditLoader key={round} id={id} onDiscard={() => setRound((r) => r + 1)} />;
}

// waits for the saved one, then opens the stages (cash and the banks load in them, as a new payment's)
function EditLoader({ id, onDiscard }: { id: string; onDiscard: () => void }) {
  const te = useTranslations("history.payment.edit");
  const read = useSalaryForEdit(id);
  if (read.loading)
    return (
      <EntryNote title={te("title")} loading>
        {te("loading")}
      </EntryNote>
    );
  // (a cancelled one can't be edited either)
  if (read.loadFailed || !read.data || read.data.editBlockedBy)
    return (
      <EntryNote title={te("title")} failed onRetry={read.retry}>
        {te("loadFailed")}
      </EntryNote>
    );
  return (
    <SalaryProvider>
      <EditEntry saved={read.data} onDiscard={onDiscard} />
    </SalaryProvider>
  );
}

// the salary stages' own state, started from the saved one, with the edit's save in place of a new one's
function EditEntry({ saved, onDiscard }: { saved: SalaryForEdit; onDiscard: () => void }) {
  const te = useTranslations("history.payment.edit");
  const router = useRouter();
  const { saveEdit, saving, saved: done } = useSaveSalaryEdit();
  const state = useSalaryEntryState({
    onDiscard,
    edit: {
      saved,
      saving,
      done,
      save: async (input) => {
        await saveEdit({ transactionId: saved.transactionId, ...input });
        router.replace(`/history/${saved.transactionId}/edit/done`);
      },
    },
  });
  return (
    <SalaryEntryProvider value={state}>
      <SalaryEntryView title={te("title")} />
    </SalaryEntryProvider>
  );
}

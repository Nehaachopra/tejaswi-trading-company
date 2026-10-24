"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { SubmitButton } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { Sheet } from "~/components/ui/sheet";
import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { trpc } from "~/trpc/client";

import { BankFields, type BankDraft, draftFrom, draftInput, draftOk, emptyDraft } from "./bank-fields";

// what a failed save means, for the message under the form
function errorKey(err: unknown) {
  const data = (err as { data?: { code?: string } })?.data;
  if (!data) return "network";
  if (data.code === "CONFLICT") return "taken";
  if (data.code === "BAD_REQUEST") return "check";
  if (data.code === "NOT_FOUND") return "gone";
  return "failed";
}

// adding a bank account (bankId "new") or editing one; the admin only. Edit starts from the saved details
// once, when it opens, so a live refresh doesn't overwrite what's being typed
export function BankSheet({ bankId, onClose }: { bankId: string | "new" | null; onClose: () => void }) {
  const t = useTranslations("accounts.bank.form");
  const utils = trpc.useUtils();
  const editing = bankId !== null && bankId !== "new";
  const bank = trpc.accounts.bank.get.useQuery({ id: editing ? bankId : "" }, { enabled: editing });
  const create = trpc.accounts.bank.create.useMutation();
  const update = trpc.accounts.bank.update.useMutation();

  const [draft, setDraft] = useState<BankDraft>(emptyDraft);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loaded = !editing || !!bank.data;
  useEffect(() => {
    if (!bankId || !loaded) return;
    setDraft(editing ? draftFrom(bank.data!) : emptyDraft());
    setTried(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it opens or first loads
  }, [bankId, loaded]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setError(null);
    if (!draftOk(draft)) return setError(t("errors.fill"));
    try {
      const saved = editing ? await update.mutateAsync({ id: bankId, ...draftInput(draft) }) : await create.mutateAsync(draftInput(draft));
      toast.success(t(editing ? "toast.saved" : "toast.added", { name: `${saved.bankName} ••${saved.last4}` }));
      void utils.accounts.invalidate();
      onClose();
    } catch (err) {
      setError(t(`errors.${errorKey(err)}`));
    }
  }

  return (
    <Sheet open={!!bankId} title={t(editing ? "editTitle" : "addTitle")} closeLabel={t("close")} onClose={onClose}>
      {!loaded ? (
        <p className="flex justify-center py-16 text-chestnut/70">
          <Spinner />
        </p>
      ) : (
        <form onSubmit={save} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
            <BankFields draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} tried={tried} />
            {error && <FieldMessage>{error}</FieldMessage>}
          </div>
          <footer className="flex shrink-0 flex-col border-t border-chestnut/15 px-5 py-4">
            <SubmitButton busy={create.isPending || update.isPending}>{t(editing ? "saveDetails" : "save")}</SubmitButton>
          </footer>
        </form>
      )}
    </Sheet>
  );
}

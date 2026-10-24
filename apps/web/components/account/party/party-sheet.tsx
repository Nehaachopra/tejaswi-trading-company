"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { SubmitButton } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { Sheet } from "~/components/ui/sheet";
import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { trpc } from "~/trpc/client";

import { draftFrom, draftInput, draftOk, emptyDraft, PartyFields, type PartyDraft } from "./party-fields";
import type { PartyType } from "./party-kinds";

// what a failed save means, for the message under the form
function errorKey(err: unknown) {
  const data = (err as { data?: { code?: string } })?.data;
  if (!data) return "network";
  // a clash is about the short name or a GSTIN; the server's message says which
  if (data.code === "CONFLICT") return (err as { message?: string }).message?.startsWith("Short name") ? "shortNameTaken" : "gstinTaken";
  if (data.code === "BAD_REQUEST") return "check";
  if (data.code === "NOT_FOUND") return "gone";
  return "failed";
}

// adding a party (partyId "new", starting on the list's type) or editing one; the admin only. Edit starts from the
// saved details once, when it opens, so a live refresh doesn't overwrite what's being typed. On saving, `onSaved`
// gets the party (its type may have changed, which moves it to another list)
export function PartySheet({
  partyId,
  type,
  onClose,
  onSaved,
}: {
  partyId: string | "new" | null;
  type: PartyType;
  onClose: () => void;
  onSaved?: (party: { id: string; type: PartyType }) => void;
}) {
  const t = useTranslations("accounts.party.form");
  const utils = trpc.useUtils();
  const editing = partyId !== null && partyId !== "new";
  const party = trpc.accounts.party.get.useQuery({ id: editing ? partyId : "" }, { enabled: editing });
  const create = trpc.accounts.party.create.useMutation();
  const update = trpc.accounts.party.update.useMutation();

  const [draft, setDraft] = useState<PartyDraft>(() => emptyDraft(type));
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loaded = !editing || !!party.data;
  useEffect(() => {
    if (!partyId || !loaded) return;
    setDraft(editing ? draftFrom(party.data!) : emptyDraft(type));
    setTried(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it opens or first loads
  }, [partyId, loaded]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setError(null);
    if (!draftOk(draft)) return setError(t("errors.fill"));
    try {
      const saved = editing ? await update.mutateAsync({ id: partyId, ...draftInput(draft) }) : await create.mutateAsync(draftInput(draft));
      toast.success(t(editing ? "toast.saved" : "toast.added", { name: saved.shortName }));
      void utils.accounts.invalidate();
      onSaved?.({ id: saved.id, type: saved.type });
      onClose();
    } catch (err) {
      setError(t(`errors.${errorKey(err)}`));
    }
  }

  return (
    <Sheet open={!!partyId} title={t(editing ? "editTitle" : `addTitle.${type}`)} closeLabel={t("close")} onClose={onClose}>
      {!loaded ? (
        <p className="flex justify-center py-16 text-chestnut/70">
          <Spinner />
        </p>
      ) : (
        <form onSubmit={save} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
            <PartyFields draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} tried={tried} />
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

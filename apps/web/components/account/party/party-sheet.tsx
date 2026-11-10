"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { SubmitButton } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { Sheet } from "~/components/ui/sheet";
import { Spinner } from "~/components/ui/spinner";
import { toast } from "~/components/ui/toast";
import { trpc } from "~/trpc/client";
import type { RouterOutputs } from "@repo/trpc/client";

import { draftFrom, draftInput, draftOk, emptyDraft, PartyFields, tdsOver, type PartyDraft, type PickedRole } from "./party-fields";
import { kindOf, partyLabel, type PartyType } from "./party-kinds";
import { useSameNameConfirm } from "./same-name";

type PartyModel = RouterOutputs["accounts"]["party"]["get"];

// what a failed save means, for the message under the form
function errorKey(err: unknown) {
  const data = (err as { data?: { code?: string } })?.data;
  if (!data) return "network";
  // a clash is about the short name or a GSTIN; the server's message says which
  if (data.code === "CONFLICT") {
    const message = (err as { message?: string }).message ?? "";
    return message.startsWith("Phone") ? "phoneTaken" : message.startsWith("Short name") ? "shortNameTaken" : "gstinTaken";
  }
  if (data.code === "BAD_REQUEST") return "check";
  if (data.code === "NOT_FOUND") return "gone";
  return "failed";
}

// editing a party right where it was picked, not in a drawer: inside a form of its own that isn't one, so saving it never
// saves the form around it. Paid so far stays as saved. `onSaved` gets the party as it now is
export function PartyEdit({
  partyId,
  onSaved,
  onCancel,
  asksTypes = true,
}: {
  partyId: string;
  onSaved: (party: PartyModel) => void;
  onCancel: () => void;
  asksTypes?: boolean;
}) {
  const t = useTranslations("accounts.party.form");
  const tc = useTranslations("transactions.chat");
  const utils = trpc.useUtils();
  const sameName = useSameNameConfirm();
  const party = trpc.accounts.party.get.useQuery({ id: partyId });
  const update = trpc.accounts.party.update.useMutation();
  const [draft, setDraft] = useState<PartyDraft | null>(null);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // starts from the saved details once, so a live refresh doesn't overwrite what's being typed
  useEffect(() => {
    if (party.data && !draft) setDraft(draftFrom(party.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it first loads
  }, [party.data]);

  async function save() {
    if (!draft) return;
    setTried(true);
    setError(null);
    if (!draftOk(draft)) return;
    if (!(await sameName.confirm(draft, partyId))) return;
    try {
      const saved = await update.mutateAsync({ id: partyId, ...draftInput(draft) });
      toast.success(t("toast.saved", { name: partyLabel(saved) }));
      void utils.accounts.invalidate();
      void utils.transactions.payment.invalidate();
      onSaved(saved);
    } catch (err) {
      setError(t(`errors.${errorKey(err)}`));
    }
  }

  if (!draft) {
    return (
      <p className="flex justify-center py-6 text-chestnut/70">
        <Spinner />
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <PartyFields
        asksTypes={asksTypes}
        draft={draft}
        onAddressesOpen={() => setTried(false)}
        onChange={(patch) => {
          setError(null);
          setDraft((d) => (d ? { ...d, ...patch } : d));
        }}
        tried={tried}
        partyId={partyId}
        asksRemarks={false}
        asksPan={false}
      />
      {tried && !draftOk(draft) && <FieldMessage className="mt-0">{t("errors.fill")}</FieldMessage>}
      {error && <FieldMessage className="mt-0">{error}</FieldMessage>}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="min-h-11 rounded-control border border-chestnut/50 px-5 text-sm font-semibold hover:border-chestnut">
          {tc("oldLoanCancel")}
        </button>
        <button
          type="button"
          data-recheck

          onClick={() => void save()}
          disabled={update.isPending}
          aria-busy={update.isPending}
          className="flex min-h-11 items-center justify-center gap-2 rounded-control bg-chestnut px-5 text-sm font-semibold text-ivory disabled:opacity-60"
        >
          {update.isPending && <Spinner className="size-4" />} {t("saveDetails")}
        </button>
      </div>
      {sameName.dialog}
    </div>
  );
}

// adding a party (partyId "new", starting on the list's type) or editing one; the admin only. Edit starts from the
// saved details once, when it opens, so a live refresh doesn't overwrite what's being typed. On saving, `onSaved`
// gets the party (its type may have changed, which moves it to another list).
export function PartySheet({
  partyId,
  type,
  startTypes,
  onClose,
  onSaved,
}: {
  partyId: string | "new" | null;
  type: PartyType;
  // the types a new one starts with (Entities → Parties, from the type picked there)
  startTypes?: PickedRole[];
  onClose: () => void;
  onSaved?: (party: { id: string; type: PartyType }) => void;
}) {
  const t = useTranslations("accounts.party.form");
  const utils = trpc.useUtils();
  const sameName = useSameNameConfirm();
  const editing = partyId !== null && partyId !== "new";
  const party = trpc.accounts.party.get.useQuery({ id: editing ? partyId : "" }, { enabled: editing });
  const create = trpc.accounts.party.create.useMutation();
  const update = trpc.accounts.party.update.useMutation();

  const [draft, setDraft] = useState<PartyDraft>(() => emptyDraft());
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // by the types ticked on the form: paid so far this year, only while TDS is on, for someone with no type (paid for
  // transport or labour) or an agent alone (brokerage), with the TDS taken too; a supplier only the amount; never a
  // customer or an employee. A transporter's declaration only for someone with no type
  const taxes = trpc.settings.page.useQuery(undefined, { enabled: !!partyId });
  const paidForWork = draft.types.length === 0 || draft.types.every((r) => r === "agent");
  const asksTds = paidForWork && !!taxes.data?.taxAudit;
  const asksPaid = asksTds || (draft.types.includes("supplier") && !!taxes.data?.tds194q);
  const ok = draftOk(draft) && !(asksTds && tdsOver(draft));
  // sent only when asked, so it stays as saved otherwise; a TDS that isn't asked stays within the amount
  const paidBefore = () => {
    const paid = Number(draft.paidBefore);
    return asksPaid ? { paidBefore: { paid, tds: asksTds ? Number(draft.tdsBefore) : Math.min(Number(draft.tdsBefore), paid) } } : {};
  };

  const loaded = !editing || !!party.data;
  useEffect(() => {
    if (!partyId || !loaded) return;
    // a new one starts with the types of the list it's added from
    setDraft(
      editing
        ? draftFrom(party.data!)
        : { ...emptyDraft(), types: startTypes ?? (type === "customer_supplier" ? ["customer", "supplier"] : type === "none" ? [] : [type]) },
    );
    setTried(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it opens or first loads
  }, [partyId, loaded]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setError(null);
    if (!ok) return;
    // the same name in the same town: asked first
    if (!(await sameName.confirm(draft, editing ? partyId : null))) return;
    try {
      const details = { ...draftInput(draft), ...paidBefore() };
      const saved = editing ? await update.mutateAsync({ id: partyId, ...details }) : await create.mutateAsync(details);
      toast.success(t(editing ? "toast.saved" : "toast.added", { name: partyLabel(saved) }));
      void utils.accounts.invalidate();
      onSaved?.({ id: saved.id, type: kindOf(saved.types) });
      onClose();
    } catch (err) {
      setError(t(`errors.${errorKey(err)}`));
    }
  }

  return (
    <>
    <Sheet open={!!partyId} title={t(editing ? "editTitle" : `addTitle.${type}`)} closeLabel={t("close")} onClose={onClose}>
      {!loaded ? (
        <p className="flex justify-center py-16 text-chestnut/70">
          <Spinner />
        </p>
      ) : (
        <form onSubmit={save} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
            <PartyFields
          asksTypes draft={draft} onAddressesOpen={() => setTried(false)} onChange={(patch) => {
                setError(null);
                setDraft((d) => ({ ...d, ...patch }));
              }} tried={tried} partyId={editing ? partyId : null} transporter={draft.types.length === 0} asksPaid={asksPaid} asksTds={asksTds} />
          </div>
          <footer className="flex shrink-0 flex-col gap-3 border-t border-chestnut/15 px-5 py-4">
            {tried && !ok && <FieldMessage className="mt-0">{t("errors.fill")}</FieldMessage>}
            {error && <FieldMessage className="mt-0">{error}</FieldMessage>}
            <SubmitButton busy={create.isPending || update.isPending}>{t(editing ? "saveDetails" : "save")}</SubmitButton>
          </footer>
        </form>
      )}
    </Sheet>
    {/* above the sheet: the same name in the same town, asked before saving */}
    {sameName.dialog}
    </>
  );
}

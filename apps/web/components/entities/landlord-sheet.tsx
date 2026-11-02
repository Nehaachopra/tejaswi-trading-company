"use client";

import { IdCard, Mail, MessageSquare, Phone, ReceiptText, Tag, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { fieldClass, SubmitButton } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { Note } from "~/components/ui/note";
import { Sheet } from "~/components/ui/sheet";
import { Spinner } from "~/components/ui/spinner";
import { Switch } from "~/components/ui/switch";
import { toast } from "~/components/ui/toast";
import { noDigits } from "~/lib/format";
import { capPhone, phoneStartsBad } from "~/lib/number-words";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";
import { GSTIN_PATTERN, PHONE_PATTERN } from "@repo/trpc/client";

import { Field, ProfilePhoto } from "../account/party/party-fields";
import { partyLabel } from "../account/party/party-kinds";

const SHORT_NAME = /^[A-Z0-9][A-Z0-9 &.-]{0,19}$/;

// a landlord as typed
type Draft = { name: string; shortName: string; phone: string; email: string; pan: string; registered: boolean; gstin: string; remarks: string };

const emptyDraft = (): Draft => ({ name: "", shortName: "", phone: "", email: "", pan: "", registered: false, gstin: "", remarks: "" });

// what's missing or wrong: only the name is a must, and the GSTIN when registered
function problems(d: Draft) {
  return {
    name: d.name.trim() === "",
    shortName: d.shortName.trim() !== "" && !SHORT_NAME.test(d.shortName.trim()),
    phone: d.phone !== "" && !PHONE_PATTERN.test(d.phone),
    email: d.email.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim()),
    pan: d.pan !== "" && !/^[A-Z]{5}\d{4}[A-Z]$/.test(d.pan),
    gstin: d.registered && !GSTIN_PATTERN.test(d.gstin),
  };
}

// what a failed save means, for the message under the form
function errorKey(err: unknown) {
  const data = (err as { data?: { code?: string } })?.data;
  if (!data) return "network";
  if (data.code === "CONFLICT") {
    const message = (err as { message?: string }).message ?? "";
    return message.startsWith("Phone") ? "landlordPhoneTaken" : message.startsWith("Short name") ? "shortNameTaken" : "landlordGstinTaken";
  }
  if (data.code === "BAD_REQUEST") return "check";
  if (data.code === "NOT_FOUND") return "gone";
  return "failed";
}

const input = (bad: boolean) => `min-h-11 w-full min-w-0 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(bad)}`;

// a landlord's details as the API takes them
const detailsOf = (d: Draft) => ({
  name: d.name.trim(),
  shortName: d.shortName.trim() || null,
  phone: d.phone,
  email: d.email.trim(),
  pan: d.pan,
  gstin: d.registered ? d.gstin : "",
  remarks: d.remarks.trim(),
});

// a landlord's fields, laid out like a party's: phone and email in a row where both fit, then name and short name, then
// the PAN set apart (a rent payment asks for it below its amount instead), their GST, and any remarks
function LandlordFields({ draft, set, tried, asksPan = true, asksRemarks = true }: { draft: Draft; set: (patch: Partial<Draft>) => void; tried: boolean; asksPan?: boolean; asksRemarks?: boolean }) {
  const t = useTranslations("accounts.party.form");
  const gstLabel = useId();
  const bad = problems(draft);
  const show = (field: keyof typeof bad) => tried && bad[field];
  const phoneBad = show("phone") || phoneStartsBad(draft.phone);
  return (
    <div className="@container flex flex-col gap-3">
      <div className="flex flex-col gap-4 @md:flex-row @md:items-start @md:gap-8">
      <ProfilePhoto />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="grid grid-cols-1 items-start gap-x-6 gap-y-3 @md:grid-cols-2">
        <Field icon={Phone} label={t("phone")}>
          <span className={cn("flex min-h-11 items-center gap-2 px-3", fieldClass(phoneBad))}>
            <span className="text-chestnut/70">+91</span>
            <input value={draft.phone} inputMode="tel" onChange={(e) => set({ phone: capPhone(e.target.value) })} aria-invalid={phoneBad || undefined} className="tabular min-w-0 flex-1 bg-transparent text-base outline-none" />
          </span>
          <span className={cn("text-xs", phoneBad ? "text-danger" : "text-chestnut/70")}>{phoneBad && draft.phone ? t("phoneBad") : t("phoneHint")}</span>
        </Field>
        <Field icon={Mail} label={t("email")}>
          <input value={draft.email} type="email" maxLength={254} autoCapitalize="none" onChange={(e) => set({ email: e.target.value.replace(/\s/g, "") })} aria-invalid={show("email") || undefined} className={input(show("email"))} />
        </Field>
      </div>
      <div className="grid grid-cols-1 items-start gap-x-6 gap-y-3 @md:grid-cols-2">
        <Field icon={User} label={t("name")} required error={show("name") && t("required")}>
          <input autoFocus value={draft.name} maxLength={150} onChange={(e) => set({ name: noDigits(e.target.value) })} aria-invalid={show("name") || undefined} className={input(show("name"))} />
        </Field>
        <Field icon={Tag} label={t("shortName")}>
          <input
            value={draft.shortName}
            maxLength={20}
            autoCapitalize="characters"
            onChange={(e) => set({ shortName: e.target.value.toUpperCase().replace(/[^A-Z0-9 &.-]/g, "") })}
            placeholder="SRT"
            aria-invalid={show("shortName") || undefined}
            className={cn(input(show("shortName")), "uppercase")}
          />
        </Field>
      </div>
      </div>
      </div>
      {asksPan && (
        <Field icon={IdCard} label={t("pan")} className="mt-6 sm:w-56">
          <input
            value={draft.pan}
            maxLength={10}
            autoCapitalize="characters"
            onChange={(e) => set({ pan: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
            placeholder="ABCDE1234F"
            aria-invalid={show("pan") || undefined}
            className={cn(input(show("pan")), "tabular uppercase")}
          />
        </Field>
      )}

      {/* GST: unregistered means we pay the reverse-charge GST on their rent; registered asks for the GSTIN */}
      <div className="mt-3 flex flex-col gap-2">
        <div className="flex items-start gap-4">
          <div className="flex shrink-0 flex-col gap-2.5">
            <span id={gstLabel} className="text-xs font-semibold">
              {t("gstRegistered")}
            </span>
            <span className="flex min-h-11 items-center">
              <Switch on={draft.registered} onFlip={(registered) => set({ registered })} labelledBy={gstLabel} />
            </span>
          </div>
          {draft.registered && (
            <Field icon={ReceiptText} label={t("gstinRequired")} required className="flex-1 sm:max-w-56" error={show("gstin") && t(draft.gstin ? "gstinHint" : "required")}>
              <input
                value={draft.gstin}
                maxLength={15}
                autoCapitalize="characters"
                onChange={(e) => set({ gstin: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
                placeholder="29ABCDE1234F1Z5"
                aria-invalid={show("gstin") || undefined}
                className={cn(input(show("gstin")), "tabular uppercase")}
              />
            </Field>
          )}
        </div>
        {!draft.registered && <Note className="text-chestnut/70">{t("unregisteredNote")}</Note>}
      </div>

      {asksRemarks && (
        <Field icon={MessageSquare} label={t("remarks")}>
          <textarea value={draft.remarks} maxLength={500} rows={2} onChange={(e) => set({ remarks: e.target.value })} className={cn(input(false), "py-2.5")} />
        </Field>
      )}
    </div>
  );
}

// adding a landlord right where they're being picked, not in a drawer: inside a form of its own that isn't one, so saving
// them never saves the form around it. `asksPan` is off where the PAN is asked below the amount
export function LandlordAdd({ name = "", landlordId, asksPan = true, onSaved, onCancel }: { name?: string; landlordId?: string; asksPan?: boolean; onSaved: (id: string) => void; onCancel: () => void }) {
  const t = useTranslations("accounts.party.form");
  const tc = useTranslations("transactions.chat");
  const utils = trpc.useUtils();
  const create = trpc.accounts.landlord.create.useMutation();
  const update = trpc.accounts.landlord.update.useMutation();
  // with `landlordId` it edits them: it starts from what's saved, once
  const saved = trpc.accounts.landlord.get.useQuery({ id: landlordId ?? "" }, { enabled: !!landlordId });
  const [draft, setDraft] = useState<Draft>(() => ({ ...emptyDraft(), name }));
  const started = useRef(false);
  useEffect(() => {
    if (!saved.data || started.current) return;
    started.current = true;
    const l = saved.data;
    setDraft({ name: l.name, shortName: l.shortName ?? "", phone: l.phone ?? "", email: l.email ?? "", pan: l.pan ?? "", registered: !!l.gstin, gstin: l.gstin ?? "", remarks: l.remarks ?? "" });
  }, [saved.data]);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => {
    setError(null);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const bad = problems(draft);
  const wrong = Object.values(bad).some(Boolean);

  async function save() {
    setTried(true);
    setError(null);
    if (wrong) return;
    try {
      const done = landlordId ? await update.mutateAsync({ id: landlordId, details: detailsOf(draft) }) : await create.mutateAsync(detailsOf(draft));
      toast.success(t(landlordId ? "toast.saved" : "toast.added", { name: partyLabel(done) }));
      await utils.accounts.landlord.invalidate();
      onSaved(done.id);
    } catch (err) {
      setError(t(`errors.${errorKey(err)}`));
    }
  }

  return (
    <div
      className="flex flex-col gap-4"
      onKeyDown={(e) => {
        // Enter here adds the landlord, not the form around it
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
          e.preventDefault();
          void save();
        }
      }}
    >
      <LandlordFields draft={draft} set={set} tried={tried} asksPan={asksPan} asksRemarks={false} />
      {tried && wrong && <FieldMessage className="mt-0">{t("errors.fill")}</FieldMessage>}
      {error && <FieldMessage className="mt-0">{error}</FieldMessage>}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="min-h-11 rounded-control border border-chestnut/50 px-5 text-sm font-semibold hover:border-chestnut">
          {tc("oldLoanCancel")}
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={create.isPending || update.isPending}
          aria-busy={create.isPending || update.isPending}
          className="flex min-h-11 items-center justify-center gap-2 rounded-control bg-chestnut px-5 text-sm font-semibold text-ivory disabled:opacity-60"
        >
          {(create.isPending || update.isPending) && <Spinner className="size-4" />} {t(landlordId ? "saveDetails" : "saveLandlord")}
        </button>
      </div>
    </div>
  );
}

// adding a landlord (landlordId "new") or editing one; `onSaved` gets who was saved. Edit starts from the saved details
// once, when it opens
export function LandlordSheet({ landlordId, onClose, onSaved }: { landlordId: string | "new" | null; onClose: () => void; onSaved?: (id: string) => void }) {
  const t = useTranslations("accounts.party.form");
  const utils = trpc.useUtils();
  const editing = landlordId !== null && landlordId !== "new";
  const landlord = trpc.accounts.landlord.get.useQuery({ id: editing ? landlordId : "" }, { enabled: editing });
  const create = trpc.accounts.landlord.create.useMutation();
  const update = trpc.accounts.landlord.update.useMutation();

  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => {
    setError(null);
    setDraft((d) => ({ ...d, ...patch }));
  };

  const loaded = !editing || !!landlord.data;
  useEffect(() => {
    if (!landlordId || !loaded) return;
    const l = editing ? landlord.data : null;
    setDraft(
      l
        ? { name: l.name, shortName: l.shortName ?? "", phone: l.phone ?? "", email: l.email ?? "", pan: l.pan ?? "", registered: !!l.gstin, gstin: l.gstin ?? "", remarks: l.remarks ?? "" }
        : emptyDraft(),
    );
    setTried(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when it opens or first loads
  }, [landlordId, loaded]);

  const bad = problems(draft);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    setError(null);
    if (Object.values(bad).some(Boolean)) return;
    const details = detailsOf(draft);
    try {
      const saved = editing ? await update.mutateAsync({ id: landlordId, details }) : await create.mutateAsync(details);
      toast.success(t(editing ? "toast.saved" : "toast.added", { name: partyLabel(saved) }));
      await utils.accounts.landlord.invalidate();
      onSaved?.(saved.id);
      onClose();
    } catch (err) {
      setError(t(`errors.${errorKey(err)}`));
    }
  }

  return (
    <Sheet open={!!landlordId} title={t(editing ? "editLandlord" : "addLandlord")} closeLabel={t("close")} onClose={onClose}>
      {!loaded ? (
        <p className="flex justify-center py-16 text-chestnut/70">
          <Spinner />
        </p>
      ) : (
        <form onSubmit={save} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
            <LandlordFields draft={draft} set={set} tried={tried} />
          </div>
          <footer className="flex shrink-0 flex-col gap-3 border-t border-chestnut/15 px-5 py-4">
            {tried && Object.values(bad).some(Boolean) && <FieldMessage className="mt-0">{t("errors.fill")}</FieldMessage>}
            {error && <FieldMessage className="mt-0">{error}</FieldMessage>}
            <SubmitButton busy={create.isPending || update.isPending}>{t(editing ? "saveDetails" : "saveLandlord")}</SubmitButton>
          </footer>
        </form>
      )}
    </Sheet>
  );
}

"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { fieldClass } from "~/components/ui/card-form";
import { spokenDigits, wholePhone } from "~/lib/number-words";
import { MicButton, MicField } from "~/components/ui/mic-button";
import { RequiredMark } from "~/components/ui/required-mark";
import { Spinner } from "~/components/ui/spinner";
import { titleCase } from "~/lib/format";
import { cn } from "~/lib/utils";
import { PHONE_PATTERN, type RouterOutputs } from "@repo/trpc/client";

import { PickMenu } from "../../stock/pick-menu";
import { GST_STATES, type StateCode, stateCodeOf } from "./party-kinds";

export type Party = RouterOutputs["accounts"]["party"]["get"];

const ADDRESS_TYPES = ["both", "billing", "shipping", "registered"] as const;
type AddressType = (typeof ADDRESS_TYPES)[number];

// lengths follow parties and party_addresses: name 150, phone 20, email 254, PAN 10, remarks 500; label 100,
// lines 200, landmark 150, city, district and state 100, PIN 6, GSTIN 15; at most 10 addresses
const MAX = { name: 150, shortName: 20, phone: 20, email: 254, remarks: 500, label: 100, line: 200, landmark: 150, place: 100 } as const;
const MAX_ADDRESSES = 10;
const SHORT_NAME = /^[A-Z0-9][A-Z0-9 &.-]{0,19}$/;

// the initials of a name, as a first suggestion for its short name: "Sri Ramswamy Traders" → "SRT"
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, "")[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, MAX.shortName);
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export type AddressDraft = {
  // stays the same while the sheet is open, so React keeps each address's fields apart
  key: string;
  id?: string;
  label: string;
  addressType: AddressType;
  addressLine1: string;
  addressLine2: string;
  landmark: string;
  city: string;
  district: string;
  state: string;
  stateCode: StateCode | null;
  postalCode: string;
  gstin: string;
  isDefault: boolean;
};

// a party as typed
export type PartyDraft = {
  name: string;
  // follows the name's initials until it's typed in
  shortName: string;
  shortNameTyped: boolean;
  phone: string;
  email: string;
  pan: string;
  remarks: string;
  addresses: AddressDraft[];
};

let keys = 0;
const newKey = () => `address-${++keys}`;

export const emptyAddress = (isDefault: boolean): AddressDraft => ({
  key: newKey(),
  label: "",
  addressType: "both",
  addressLine1: "",
  addressLine2: "",
  landmark: "",
  city: "",
  district: "",
  state: "",
  stateCode: null,
  postalCode: "",
  gstin: "",
  isDefault,
});

export const emptyDraft = (): PartyDraft => ({
  name: "",
  shortName: "",
  shortNameTyped: false,
  phone: "",
  email: "",
  pan: "",
  remarks: "",
  addresses: [emptyAddress(true)],
});

export const draftFrom = (p: Party): PartyDraft => ({
  name: p.name,
  shortName: p.shortName ?? "",
  shortNameTyped: true,
  phone: p.phone ?? "",
  email: p.email ?? "",
  pan: p.pan ?? "",
  remarks: p.remarks ?? "",
  addresses: p.addresses.map((a) => ({
    key: newKey(),
    id: a.id,
    label: a.label ?? "",
    addressType: a.addressType,
    addressLine1: a.addressLine1,
    addressLine2: a.addressLine2 ?? "",
    landmark: a.landmark ?? "",
    city: a.city,
    district: a.district,
    state: a.state,
    stateCode: a.stateCode,
    postalCode: a.postalCode,
    gstin: a.gstin ?? "",
    isDefault: a.isDefault,
  })),
});

// an address with nothing typed in it is simply left out
const blank = (a: AddressDraft) => [a.addressLine1, a.city, a.district, a.state, a.postalCode, a.gstin, a.label, a.addressLine2, a.landmark].every((v) => v.trim() === "");

function addressProblems(a: AddressDraft) {
  const gstin = a.gstin.trim();
  return {
    addressLine1: a.addressLine1.trim() === "",
    city: a.city.trim() === "",
    district: a.district.trim() === "",
    state: a.stateCode === null,
    postalCode: !/^\d{6}$/.test(a.postalCode),
    gstin: gstin !== "" && (!GSTIN.test(gstin) || gstin.slice(0, 2) !== a.stateCode),
  };
}

// what's missing or wrong: the party's own fields (its phone always: a mobile, or a landline with its STD code), then each
// address's (blank addresses don't count). `strict` (a party added from a receipt) also needs its first address in full
export function draftProblems(d: PartyDraft, strict = false) {
  return {
    party: {
      name: d.name.trim() === "",
      phone: !PHONE_PATTERN.test(d.phone),
      shortName: d.shortName.trim() !== "" && !SHORT_NAME.test(d.shortName.trim()),
      email: d.email.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim()),
      pan: d.pan.trim() !== "" && !/^[A-Z]{5}\d{4}[A-Z]$/.test(d.pan.trim()),
    },
    addresses: d.addresses.map((a, i) => (blank(a) && !(strict && i === 0) ? null : addressProblems(a))),
  };
}

export const draftOk = (d: PartyDraft, strict = false) => {
  const p = draftProblems(d, strict);
  return Object.values(p.party).every((bad) => !bad) && p.addresses.every((a) => !a || Object.values(a).every((bad) => !bad));
};

// the draft as the API takes it; the default address is the marked one among those kept, or the first
export function draftInput(d: PartyDraft) {
  const kept = d.addresses.filter((a) => !blank(a));
  return {
    details: { name: d.name.trim(), shortName: d.shortName.trim() || null, phone: d.phone, email: d.email.trim(), pan: d.pan.trim(), remarks: d.remarks.trim() },
    addresses: kept.map((a) => ({
      ...(a.id ? { id: a.id } : {}),
      label: a.label.trim(),
      addressType: a.addressType,
      addressLine1: a.addressLine1.trim(),
      addressLine2: a.addressLine2.trim(),
      landmark: a.landmark.trim(),
      city: a.city.trim(),
      district: a.district.trim(),
      state: a.state.trim(),
      stateCode: a.stateCode!,
      postalCode: a.postalCode,
      gstin: a.gstin.trim(),
      isDefault: a.isDefault,
    })),
  };
}

const input = (bad: boolean) => `min-h-11 w-full min-w-0 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(bad)}`;

// a labelled field
function Field({ label, children, className, required = false }: { label: string; children: React.ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-sm">
        {label}
        {required && <RequiredMark />}
      </span>
      {children}
    </label>
  );
}

// the places behind a PIN, from India Post's free PIN directory (no key)
type Lookup = { state: "idle" | "looking" | "missing" } | { state: "found"; place: string };

// one address: PIN first (it fills in the city, district and state), then the lines, then GSTIN, a label, what
// it's used for, and whether it's the default
function AddressFields({
  address,
  index,
  count,
  tried,
  required = false,
  onChange,
  onRemove,
  onMakeDefault,
}: {
  address: AddressDraft;
  index: number;
  count: number;
  tried: boolean;
  // filled in or not, it must be complete
  required?: boolean;
  onChange: (patch: Partial<AddressDraft>) => void;
  onRemove: () => void;
  onMakeDefault: () => void;
}) {
  const t = useTranslations("accounts.party.form");
  const bad = blank(address) && !required ? null : addressProblems(address);
  // its must-haves are starred when it must be filled, or once anything is typed in it
  const must = required || !blank(address);
  const show = (field: keyof ReturnType<typeof addressProblems>) => tried && !!bad?.[field];
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  // what the lookup last filled in, so it only fills empty fields or replaces its own suggestion, never what was
  // typed or saved
  const filled = useRef({ city: "", district: "", state: "" });
  const latest = useRef(address);
  latest.current = address;

  // look the PIN up once it has 6 digits
  useEffect(() => {
    if (!/^\d{6}$/.test(address.postalCode)) return setLookup({ state: "idle" });
    const controller = new AbortController();
    setLookup({ state: "looking" });
    fetch(`https://api.postalpincode.in/pincode/${address.postalCode}`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ Status: string; PostOffice: { District: string; State: string }[] | null }[]>) : null))
      .then((found) => {
        const office = found?.[0]?.Status === "Success" ? found[0].PostOffice?.[0] : undefined;
        if (!office) return setLookup({ state: "missing" });
        const district = office.District.slice(0, MAX.place);
        const state = office.State.slice(0, MAX.place);
        setLookup({ state: "found", place: `${district}, ${state}` });
        const a = latest.current;
        const patch: Partial<AddressDraft> = {};
        if (a.city === "" || a.city === filled.current.city) patch.city = district;
        if (a.district === "" || a.district === filled.current.district) patch.district = district;
        if (a.state === "" || a.state === filled.current.state) {
          patch.state = state;
          patch.stateCode = stateCodeOf(state);
        }
        filled.current = { city: district, district, state };
        onChange(patch);
      })
      .catch((e: unknown) => {
        if ((e as Error).name !== "AbortError") setLookup({ state: "missing" });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the PIN changes
  }, [address.postalCode]);

  return (
    <fieldset className="flex flex-col gap-4 rounded-control border border-chestnut/20 p-3">
      {/* which address, default or not, remove */}
      <legend className="sr-only">{t("addressN", { n: index + 1 })}</legend>
      <div className="flex items-center gap-2">
        <span className="flex-1 text-sm font-semibold">{t("addressN", { n: index + 1 })}</span>
        <button
          type="button"
          aria-pressed={address.isDefault}
          onClick={onMakeDefault}
          className={cn("min-h-9 rounded-control border px-3 text-xs", address.isDefault ? "border-chestnut bg-chestnut font-medium text-ivory" : "border-chestnut/50 hover:border-chestnut")}
        >
          {t(address.isDefault ? "isDefault" : "makeDefault")}
        </button>
        {count > 1 && (
          <button type="button" onClick={onRemove} aria-label={t("removeAddress")} className="grid size-9 place-items-center rounded-control border border-chestnut/50 hover:border-chestnut">
            <Trash2 className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {/* PIN, with what it found */}
      <Field label={t("pin")} required={must}>
        <input
          value={address.postalCode}
          inputMode="numeric"
          maxLength={6}
          onChange={(e) => onChange({ postalCode: e.target.value.replace(/\D/g, "") })}
          placeholder="560022"
          aria-invalid={show("postalCode") || undefined}
          className={cn(input(show("postalCode")), "tabular")}
        />
        {lookup.state === "looking" && (
          <span className="flex items-center gap-2 text-xs text-chestnut/70">
            <Spinner className="size-3.5" /> {t("lookingUp")}
          </span>
        )}
        {lookup.state === "found" && <span className="truncate text-xs text-chestnut/70">{titleCase(lookup.place.toLowerCase())}</span>}
        {lookup.state === "missing" && <span className="text-xs text-chestnut/70">{t("pinNotFound")}</span>}
      </Field>

      {/* the lines */}
      <Field label={t("line1")} required={must}>
        <MicField onText={(said) => onChange({ addressLine1: (address.addressLine1.trim() ? `${address.addressLine1.trim()} ${said}` : said).slice(0, MAX.line) })}>
          <input value={address.addressLine1} maxLength={MAX.line} onChange={(e) => onChange({ addressLine1: e.target.value })} aria-invalid={show("addressLine1") || undefined} className={cn(input(show("addressLine1")), "pr-11")} />
        </MicField>
      </Field>
      <Field label={t("line2")}>
        <MicField onText={(said) => onChange({ addressLine2: (address.addressLine2.trim() ? `${address.addressLine2.trim()} ${said}` : said).slice(0, MAX.line) })}>
          <input value={address.addressLine2} maxLength={MAX.line} onChange={(e) => onChange({ addressLine2: e.target.value })} className={cn(input(false), "pr-11")} />
        </MicField>
      </Field>
      <Field label={t("landmark")}>
        <MicField onText={(said) => onChange({ landmark: (address.landmark.trim() ? `${address.landmark.trim()} ${said}` : said).slice(0, MAX.landmark) })}>
          <input value={address.landmark} maxLength={MAX.landmark} onChange={(e) => onChange({ landmark: e.target.value })} className={cn(input(false), "pr-11")} />
        </MicField>
      </Field>

      {/* city, district and state (filled in from the PIN, still editable) */}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("city")} required={must}>
          <MicField onText={(said) => onChange({ city: (address.city.trim() ? `${address.city.trim()} ${said}` : said).slice(0, MAX.place) })}>
          <input value={address.city} maxLength={MAX.place} onChange={(e) => onChange({ city: e.target.value })} aria-invalid={show("city") || undefined} className={cn(input(show("city")), "pr-11")} />
        </MicField>
        </Field>
        <Field label={t("district")} required={must}>
          <MicField onText={(said) => onChange({ district: (address.district.trim() ? `${address.district.trim()} ${said}` : said).slice(0, MAX.place) })}>
          <input value={address.district} maxLength={MAX.place} onChange={(e) => onChange({ district: e.target.value })} aria-invalid={show("district") || undefined} className={cn(input(show("district")), "pr-11")} />
        </MicField>
        </Field>
      </div>
      <Field label={t("state")} required={must}>
        <PickMenu
          label={t("state")}
          current={address.stateCode ? (GST_STATES.find(([code]) => code === address.stateCode)?.[1] ?? address.state) : t("pick")}
          options={GST_STATES.map(([code, name]) => ({ id: code, name, hint: code }))}
          picked={address.stateCode ?? "29"}
          onPick={(code) => onChange({ stateCode: code, state: GST_STATES.find(([c]) => c === code)![1] })}
          invalid={show("state")}
          searchable
          searchLabel={t("searchState")}
          noMatch={t("noState")}
        />
      </Field>

      {/* GSTIN (its first two digits are the state's code), a label, and what it's used for */}
      <Field label={t("gstin")}>
        <input
          value={address.gstin}
          maxLength={15}
          autoCapitalize="characters"
          onChange={(e) => onChange({ gstin: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
          placeholder={`${address.stateCode ?? "29"}ABCDE1234F1Z5`}
          aria-invalid={show("gstin") || undefined}
          className={cn(input(show("gstin")), "tabular uppercase")}
        />
        {show("gstin") && <span className="text-xs text-danger">{t("gstinHint")}</span>}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("label")}>
          <input value={address.label} maxLength={MAX.label} onChange={(e) => onChange({ label: e.target.value })} placeholder={t("labelPlaceholder")} className={input(false)} />
        </Field>
        <Field label={t("use")}>
          <PickMenu
            label={t("use")}
            current={t(`uses.${address.addressType}`)}
            options={ADDRESS_TYPES.map((type) => ({ id: type, name: t(`uses.${type}`) }))}
            picked={address.addressType}
            onPick={(addressType) => onChange({ addressType })}
          />
        </Field>
      </div>
    </fieldset>
  );
}

// the party's fields: who it is and how to reach them, its addresses and remarks (its type comes from its sales and
// purchases); its opening balance is set on the Opening balances page. With `phoneFirst` the phone comes first, with
// `belowPhone` under it (a receipt shows the parties already added with that phone there); `onlyPhone` hides the rest
// (that phone is someone already added, shown in their place)
export function PartyFields({
  draft,
  onChange,
  tried,
  phoneFirst = false,
  belowPhone,
  onlyPhone = false,
  belowName,
  strict = false,
}: {
  draft: PartyDraft;
  onChange: (patch: Partial<PartyDraft>) => void;
  tried: boolean;
  phoneFirst?: boolean;
  belowPhone?: React.ReactNode;
  onlyPhone?: boolean;
  // under the name: parties with a similar name, as a suggestion
  belowName?: React.ReactNode;
  // a party added from a receipt: its phone and first address are needed too
  strict?: boolean;
}) {
  const t = useTranslations("accounts.party.form");
  const bad = draftProblems(draft, strict).party;
  const show = (field: keyof typeof bad) => tried && bad[field];

  // one address changed, added, removed or made the default
  const setAddress = (key: string, patch: Partial<AddressDraft>) => onChange({ addresses: draft.addresses.map((a) => (a.key === key ? { ...a, ...patch } : a)) });
  const removeAddress = (key: string) => {
    const left = draft.addresses.filter((a) => a.key !== key);
    onChange({ addresses: left.some((a) => a.isDefault) ? left : left.map((a, i) => ({ ...a, isDefault: i === 0 })) });
  };

  // a spoken phone adds to a part already typed (a whole one is replaced)
  const phoneSoFar = draft.phone.length >= 10 ? "" : draft.phone;

  // the phone, with whatever goes under it
  const phone = (
    <div className="relative flex flex-col gap-2">
      <Field label={t("phoneRequired")} required>
        <span className={cn("flex min-h-11 items-center gap-2 px-3", fieldClass(show("phone")))}>
          <span className="text-chestnut/70">+91</span>
          <input
            autoFocus={phoneFirst}
            aria-invalid={show("phone") || undefined}
            value={draft.phone}
            inputMode="tel"
            maxLength={MAX.phone}
            onChange={(e) => onChange({ phone: e.target.value.replace(/\D/g, "") })}
            className="tabular min-w-0 flex-1 bg-transparent text-base outline-none"
          />
          {/* spoken digit by digit: it listens through pauses until all 10 are in, adding to a part already there */}
          <MicButton
            onText={(said) => onChange({ phone: (phoneSoFar + spokenDigits(said)).slice(0, 10) })}
            until={(heard) => wholePhone(heard, phoneSoFar)}
          />
        </span>
        <span className={cn("text-xs", show("phone") ? "text-danger" : "text-chestnut/70")}>{t("phoneHint")}</span>
      </Field>
      {belowPhone}
    </div>
  );

  if (onlyPhone) return phone;

  return (
    <div className="flex flex-col gap-5">
      {phoneFirst && phone}

      {/* who it is and how to reach them */}
      <div className="relative flex flex-col gap-2">
        <Field label={t("name")} required>
          <MicField
            onText={(said) => {
              const name = (draft.name.trim() ? `${draft.name.trim()} ${said}` : said).slice(0, MAX.name);
              onChange({ name, ...(draft.shortNameTyped ? {} : { shortName: initialsOf(name) }) });
            }}
          >
            <input
            autoFocus={!phoneFirst}
            value={draft.name}
            maxLength={MAX.name}
            onChange={(e) => onChange({ name: e.target.value, ...(draft.shortNameTyped ? {} : { shortName: initialsOf(e.target.value) }) })}
            aria-invalid={show("name") || undefined}
            className={cn(input(show("name")), "pr-11")}
          />
          </MicField>
        </Field>
        {belowName}
      </div>
      {/* the short name ledgers and lists show (optional; without it they show the full name); suggested from the
          name's initials */}
      <Field label={t("shortName")}>
        <input
          value={draft.shortName}
          maxLength={MAX.shortName}
          autoCapitalize="characters"
          onChange={(e) => onChange({ shortName: e.target.value.toUpperCase().replace(/[^A-Z0-9 &.-]/g, ""), shortNameTyped: true })}
          placeholder="SRT"
          aria-invalid={show("shortName") || undefined}
          className={cn(input(show("shortName")), "uppercase")}
        />
        <span className="text-xs text-chestnut/70">{t("shortNameHint")}</span>
      </Field>
      {!phoneFirst && phone}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("email")}>
          <input
            value={draft.email}
            type="email"
            maxLength={MAX.email}
            autoCapitalize="none"
            onChange={(e) => onChange({ email: e.target.value.replace(/\s/g, "") })}
            aria-invalid={show("email") || undefined}
            className={input(show("email"))}
          />
        </Field>
        <Field label={t("pan")}>
          <input
            value={draft.pan}
            maxLength={10}
            autoCapitalize="characters"
            onChange={(e) => onChange({ pan: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
            placeholder="ABCDE1234F"
            aria-invalid={show("pan") || undefined}
            className={cn(input(show("pan")), "tabular uppercase")}
          />
        </Field>
      </div>

      {/* the addresses, each with its own PIN lookup */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm">{t("addresses")}</h3>
        {draft.addresses.map((a, i) => (
          <AddressFields
            key={a.key}
            address={a}
            index={i}
            count={draft.addresses.length}
            tried={tried}
            required={strict && i === 0}
            onChange={(patch) => setAddress(a.key, patch)}
            onRemove={() => removeAddress(a.key)}
            onMakeDefault={() => onChange({ addresses: draft.addresses.map((x) => ({ ...x, isDefault: x.key === a.key })) })}
          />
        ))}
        {draft.addresses.length < MAX_ADDRESSES && (
          <button
            type="button"
            onClick={() => onChange({ addresses: [...draft.addresses, emptyAddress(draft.addresses.length === 0)] })}
            className="flex min-h-11 items-center justify-center gap-2 rounded-control border border-dashed border-chestnut/50 text-sm hover:border-chestnut"
          >
            <Plus className="size-4" aria-hidden /> {t("addAddress")}
          </button>
        )}
      </section>


      <Field label={t("remarks")}>
        <textarea value={draft.remarks} maxLength={MAX.remarks} rows={2} onChange={(e) => onChange({ remarks: e.target.value })} className={cn(input(false), "py-2.5")} />
      </Field>
    </div>
  );
}

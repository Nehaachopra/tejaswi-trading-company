"use client";

import { Building2, House, IdCard, Landmark, Mail, Map, MapPin, MapPinned, MessageSquare, Pencil, Percent, Phone, Plus, QrCode, ReceiptText, Tag, Trash2, User, Wallet, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { ADD_ON_IVORY } from "~/components/ui/page-styles";
import { fieldClass } from "~/components/ui/card-form";
import { capPhone, phoneStartsBad, spokenDigits, wholePhone } from "~/lib/number-words";
import { DateInput } from "~/components/ui/date-input";
import { FieldMessage } from "~/components/ui/field-message";
import { MultiAccordion } from "~/components/ui/multi-accordion";
import { MicButton, MicField } from "~/components/ui/mic-button";
import { NumberInput } from "~/components/ui/number-input";
import { RequiredMark } from "~/components/ui/required-mark";
import { Spinner } from "~/components/ui/spinner";
import { noDigits, titleCase } from "~/lib/format";
import { indiaPostPlace, indiaPostTownPin } from "~/lib/india-post";
import { cn } from "~/lib/utils";
import { trpc } from "~/trpc/client";
import { GSTIN_PATTERN, PHONE_PATTERN, type RouterOutputs, upiFormatOk } from "@repo/trpc/client";

import { PickMenu } from "../../stock/pick-menu";
import { DISTRICTS } from "./districts";
import { GST_STATES, type StateCode, stateCodeOf } from "./party-kinds";

export type Party = RouterOutputs["accounts"]["party"]["get"];

const ADDRESS_TYPES = ["both", "billing", "shipping", "registered"] as const;
type AddressType = (typeof ADDRESS_TYPES)[number];

// lengths follow parties and party_addresses: name 150, phone 20, email 254, PAN 10, remarks 500; label 100,
// lines 200, landmark 150, city, district and state 100, PIN 6, GSTIN 15; at most 10 addresses
const MAX = { name: 150, shortName: 20, phone: 20, email: 254, remarks: 500, label: 100, line: 200, landmark: 150, place: 100 } as const;
const MAX_ADDRESSES = 10;
const SHORT_NAME = /^[A-Z0-9][A-Z0-9 &.-]{0,19}$/;


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
// what a party can be picked as on its form (a landlord is added in Entities → Landlords)
export const PICKED_ROLES = ["customer", "supplier", "employee", "lender", "agent"] as const;
export type PickedRole = (typeof PICKED_ROLES)[number];

export type PartyDraft = {
  // what they are to us, any of PICKED_ROLES (none for anyone else)
  types: PickedRole[];
  // an employee's pay, as typed: monthly salary, the day of the month it falls due, the day they joined
  monthlySalary: string;
  payDay: string;
  joiningDate: string;
  name: string;
  shortName: string;
  // another party already has this short name (checked as it's typed)
  shortNameTaken: boolean;
  // a small transporter's declaration: no TDS on its transport (kept as saved until it has its own box)
  transportDeclaration: boolean;
  phone: string;
  email: string;
  pan: string;
  remarks: string;
  // paid this year outside this app, with the TDS taken from it
  paidBefore: string;
  tdsBefore: string;
  addresses: AddressDraft[];
  // the UPI IDs they're paid on
  upiIds: { key: string; upiId: string }[];
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
  types: [],
  monthlySalary: "",
  payDay: "",
  joiningDate: "",
  name: "",
  shortName: "",
  shortNameTaken: false,
  transportDeclaration: false,
  phone: "",
  email: "",
  pan: "",
  remarks: "",
  paidBefore: "",
  tdsBefore: "",
  addresses: [emptyAddress(true)],
  upiIds: [],
});

// a new party's form with nothing typed in it yet (its address's own key aside)
const blankOf = (d: PartyDraft) =>
  JSON.stringify({ ...d, addresses: d.addresses.map((x) => ({ ...x, key: "" })) });
export const draftUntouched = (d: PartyDraft) => blankOf(d) === blankOf(emptyDraft());

export const draftFrom = (p: Party): PartyDraft => ({
  types: PICKED_ROLES.filter((r) => p.types.includes(r)),
  monthlySalary: p.employment ? String(p.employment.monthlySalary) : "",
  payDay: p.employment ? String(p.employment.payDay) : "",
  joiningDate: p.employment?.joiningDate ?? "",
  name: p.name,
  shortName: p.shortName ?? "",
  shortNameTaken: false,
  transportDeclaration: p.transportDeclaration,
  phone: p.phone ?? "",
  email: p.email ?? "",
  pan: p.pan ?? "",
  remarks: p.remarks ?? "",
  paidBefore: p.paidBefore ? String(p.paidBefore.paid) : "",
  tdsBefore: p.paidBefore?.tds ? String(p.paidBefore.tds) : "",
  upiIds: p.upiIds.map((upiId) => ({ key: newKey(), upiId })),
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
export const blank = (a: AddressDraft) => [a.addressLine1, a.city, a.district, a.state, a.postalCode, a.gstin, a.label, a.addressLine2, a.landmark].every((v) => v.trim() === "");

export function addressProblems(a: AddressDraft) {
  const gstin = a.gstin.trim();
  return {
    city: a.city.trim() === "",
    district: a.district.trim() === "",
    state: a.stateCode === null,
    postalCode: !/^\d{6}$/.test(a.postalCode),
    gstin: gstin !== "" && (!GSTIN_PATTERN.test(gstin) || gstin.slice(0, 2) !== a.stateCode),
  };
}

// what's missing or wrong: the party's own fields (its phone always: a mobile, or a landline with its STD code), then each
// address's (blank addresses don't count). `strict` (a party added from a receipt) also needs its first address in full
export function draftProblems(d: PartyDraft, strict = false, phoneOptional = false) {
  return {
    party: {
      name: d.name.trim() === "",
      phone: !(PHONE_PATTERN.test(d.phone) || (phoneOptional && d.phone === "")),
      shortName: d.shortNameTaken || (d.shortName.trim() !== "" && !SHORT_NAME.test(d.shortName.trim())),
      email: d.email.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim()),
      pan: d.pan.trim() !== "" && !/^[A-Z]{5}\d{4}[A-Z]$/.test(d.pan.trim()),
      upi: d.upiIds.some((u) => upiBad(d, u.key)),
    },
    addresses: d.addresses.map((a, i) => (blank(a) && !(strict && i === 0) ? null : addressProblems(a))),
  };
}

// an employee's pay that isn't in yet (only with the employee type)
export const employmentProblems = (d: PartyDraft) => {
  const employee = d.types.includes("employee");
  const day = Number(d.payDay);
  return {
    monthlySalary: employee && !(Number(d.monthlySalary) > 0),
    payDay: employee && !(Number.isInteger(day) && day >= 1 && day <= 31),
    joiningDate: employee && d.joiningDate === "",
  };
};

export const draftOk = (d: PartyDraft, strict = false, phoneOptional = false) => {
  const p = draftProblems(d, strict, phoneOptional);
  return (
    Object.values(p.party).every((bad) => !bad) &&
    p.addresses.every((a) => !a || Object.values(a).every((bad) => !bad)) &&
    Object.values(employmentProblems(d)).every((bad) => !bad)
  );
};

// TDS typed above what was paid
export const tdsOver = (d: PartyDraft) => Number(d.tdsBefore) > Number(d.paidBefore);

// a UPI ID typed that isn't name@handle, or is in twice (blank ones are left out)
export function upiBad(d: { upiIds: PartyDraft["upiIds"] }, key: string) {
  const u = d.upiIds.find((x) => x.key === key)!.upiId.trim();
  if (u === "") return false;
  return !upiFormatOk(u) || d.upiIds.filter((x) => x.upiId.trim() === u).length > 1;
}

// an address as the API takes it
export const addressInput = (a: AddressDraft) => ({
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
});

// the draft as the API takes it; the default address is the marked one among those kept, or the first
export function draftInput(d: PartyDraft) {
  const kept = d.addresses.filter((a) => !blank(a));
  return {
    // always sent, so a party saved from anywhere keeps its types
    types: d.types,
    // an employee's pay with the employee type (left out otherwise)
    employment: d.types.includes("employee")
      ? { monthlySalary: Number(d.monthlySalary), payDay: Number(d.payDay), joiningDate: d.joiningDate }
      : null,
    upiIds: d.upiIds.map((u) => u.upiId.trim()).filter((u) => u !== ""),
    details: { name: d.name.trim(), shortName: d.shortName.trim() || null, phone: d.phone, email: d.email.trim(), pan: d.pan.trim(), remarks: d.remarks.trim(), transportDeclaration: d.transportDeclaration },
    addresses: kept.map(addressInput),
  };
}

const input = (bad: boolean) => `min-h-11 w-full min-w-0 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(bad)}`;

// the profile photo's placeholder, left of the personal details (above them on a phone)
export function ProfilePhoto() {
  return (
    <div className="grid size-28 shrink-0 place-items-center self-center rounded-full bg-chestnut/10 text-chestnut/50 shadow-[0_14px_10px_-10px] shadow-chestnut/70 @md:self-start" aria-hidden>
      <User className="size-12" />
    </div>
  );
}

// a part of the form's title
const SECTION_TITLE = "text-xs font-semibold uppercase tracking-[0.08em] opacity-60";

// a labelled field, with an icon before its label
export function Field({ label, icon: Icon, children, className, required = false, error }: { label: string; icon?: LucideIcon; children: React.ReactNode; className?: string; required?: boolean; error?: string | false }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-2.5", className)}>
      <span className="flex items-center gap-1.5 text-xs font-semibold">
        {Icon && <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />}
        <span>
          {label}
          {required && <RequiredMark />}
        </span>
      </span>
      {children}
      {/* what's missing or wrong, once Save was tried */}
      {error && <FieldMessage className="mt-0">{error}</FieldMessage>}
    </label>
  );
}

// the places behind a PIN, from India Post's free PIN directory (no key)
type Lookup = { state: "idle" | "looking" | "missing" } | { state: "found"; place: string };

// one address: PIN first (it fills in the city, district and state), then the lines and GSTIN; its name, what
// it's used for and whether it's the default are in its header. `single` (a landlord's one address): no header and no
// GSTIN, which is asked with their GST
export function AddressFields({
  address,
  index,
  count,
  tried,
  required = false,
  onChange,
  onRemove,
  onMakeDefault,
  onRestart,
  single = false,
}: {
  single?: boolean;
  address: AddressDraft;
  index: number;
  count: number;
  tried: boolean;
  // filled in or not, it must be complete
  required?: boolean;
  onChange: (patch: Partial<AddressDraft>) => void;
  onRemove: () => void;
  onMakeDefault: () => void;
  // a new state or district cleared what was under it, which isn't a mistake to mark
  onRestart?: () => void;
}) {
  const t = useTranslations("accounts.party.form");
  const bad = blank(address) && !required ? null : addressProblems(address);
  // its must-haves are starred when it must be filled, or once anything is typed in it
  const must = required || !blank(address);
  const show = (field: keyof ReturnType<typeof addressProblems>) => tried && !!bad?.[field];
  const utils = trpc.useUtils();
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  // its name being changed
  const [naming, setNaming] = useState(false);
  // a different district starts what's under it again (town, PIN and lines); a first pick keeps what's typed
  const setDistrict = (district: string) => {
    if (district === address.district) return;
    if (address.district.trim() === "") return onChange({ district });
    pinFromTown.current = "";
    onRestart?.();
    onChange({ district, city: "", postalCode: "", addressLine1: "", addressLine2: "", landmark: "" });
  };
  // the town changed: a PIN typed stays, with its district and state (only a PIN the town itself filled in is looked up
  // again for the new town)
  const setCity = (city: string) => {
    if (city === address.city) return;
    const pinWasFilled = address.postalCode !== "" && address.postalCode === pinFromTown.current;
    onChange(pinWasFilled ? { city, postalCode: "" } : { city });
  };
  // the state's districts, with a name the PIN directory gave or one typed in if the list doesn't have it
  const districts = address.stateCode ? DISTRICTS[address.stateCode] : undefined;
  const inList = (name: string, list: readonly string[] | undefined) => !!list?.some((d) => d.toLowerCase() === name.trim().toLowerCase());
  const districtOptions = [...(address.district.trim() !== "" && !inList(address.district, districts) ? [address.district] : []), ...(districts ?? [])];
  // the PIN the address opened with: a saved address isn't filled over until its PIN is changed
  const openedPin = useRef(address.postalCode);
  // the PIN filled in from the town
  const pinFromTown = useRef("");

  // look the PIN up once it has 6 digits: an address already saved with it first, India Post's PIN directory only
  // when none has it
  useEffect(() => {
    const pin = address.postalCode;
    if (!/^\d{6}$/.test(pin)) return setLookup({ state: "idle" });
    // filled in from the town below: the town stays as it was typed
    if (pin === pinFromTown.current) return;
    const controller = new AbortController();
    setLookup({ state: "looking" });

    // a new PIN is a new place: its town, district and state replace what was there (a saved address opened with
    // this PIN keeps its own)
    const fill = (place: { city: string; district: string; state: string; stateCode: StateCode | null }) => {
      setLookup({ state: "found", place: `${place.district}, ${place.state}` });
      if (pin === openedPin.current && address.city !== "") return;
      onChange({ city: place.city, district: place.district, state: place.state, stateCode: place.stateCode });
    };

    // India Post's free PIN directory: the town (its block) and the district
    const fromIndiaPost = () =>
      indiaPostPlace(pin, controller.signal).then((place) => {
        if (!place) return setLookup({ state: "missing" });
        fill({ ...place, stateCode: stateCodeOf(place.state) });
      });

    utils.accounts.party.pinPlace
      .fetch({ postalCode: pin })
      .catch(() => null)
      .then((saved) => {
        // the PIN changed while it looked
        if (controller.signal.aborted) return;
        return saved ? fill(saved) : fromIndiaPost();
      })
      .catch((e: unknown) => {
        if ((e as Error).name !== "AbortError") setLookup({ state: "missing" });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the PIN changes
  }, [address.postalCode]);

  // the other way round: a town typed with no PIN yet, once typing pauses, fills the PIN from an address already saved
  // with that town, or India Post when none has it, and its district and state with it
  useEffect(() => {
    const city = address.city.trim();
    if (address.postalCode !== "" || city.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const fill = (place: { postalCode: string; district: string; state: string; stateCode: StateCode | null }) => {
        pinFromTown.current = place.postalCode;
        onChange({ postalCode: place.postalCode, district: place.district, ...(place.stateCode ? { state: place.state, stateCode: place.stateCode } : {}) });
      };
      void utils.accounts.party.townPin
        .fetch({ city })
        .catch(() => null)
        .then(async (saved) => {
          if (controller.signal.aborted) return;
          if (saved) return fill(saved);
          const found = await indiaPostTownPin(city, controller.signal);
          if (found && !controller.signal.aborted) fill({ ...found, stateCode: stateCodeOf(found.state) });
        })
        .catch(() => undefined);
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the town changes
  }, [address.city]);

  return (
    <fieldset className="flex flex-col gap-4 rounded-control border border-chestnut/20 p-3">
      {/* which address, default or not, remove */}
      <legend className="sr-only">{t("addressN", { n: index + 1 })}</legend>
      {!single && (
      <div className="flex flex-wrap items-center gap-2">
        {/* its name, "Address 1" until it's given one, changed with the pen */}
        <div className="flex min-w-0 flex-1 basis-20 items-center gap-1">
          {naming ? (
            <input
              autoFocus
              value={address.label}
              maxLength={MAX.label}
              aria-label={t("label")}
              placeholder={t("labelPlaceholder")}
              onChange={(e) => onChange({ label: e.target.value })}
              onBlur={() => setNaming(false)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), setNaming(false))}
              className={cn(input(false), "min-h-9 px-1 text-sm")}
            />
          ) : (
            <>
              <span className="truncate text-sm font-semibold">{address.label.trim() || t("addressN", { n: index + 1 })}</span>
              <button type="button" onClick={() => setNaming(true)} aria-label={t("label")} className="grid size-9 shrink-0 place-items-center rounded-control hover:bg-chestnut/[0.08]">
                <Pencil className="size-3.5" aria-hidden />
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <PickMenu
            label={t("use")}
            current={t(`uses.${address.addressType}`)}
            options={ADDRESS_TYPES.map((type) => ({ id: type, name: t(`uses.${type}`) }))}
            picked={address.addressType}
            onPick={(addressType) => onChange({ addressType })}
            align="right"
            className="min-h-9 w-auto gap-1.5 text-xs"
          />
          <button
            type="button"
            aria-pressed={address.isDefault}
            onClick={onMakeDefault}
            className={cn("min-h-9 rounded-control border px-3 text-xs", address.isDefault ? "border-chestnut bg-chestnut font-medium text-ivory" : "border-chestnut/50 hover:border-chestnut")}
          >
            {t(address.isDefault ? "isDefault" : "makeDefault")}
          </button>
        </div>
        {count > 1 && (
          <button type="button" onClick={onRemove} aria-label={t("removeAddress")} className="grid size-9 place-items-center rounded-control border border-chestnut/50 hover:border-chestnut">
            <Trash2 className="size-4" aria-hidden />
          </button>
        )}
      </div>
      )}

      {/* the city beside its PIN, each filling the other and the state and district below; then those two */}
      <div className="grid grid-cols-2 items-start gap-x-6 gap-y-3">
        <Field icon={Building2} label={t("city")} required={must} error={show("city") && t("required")}>
          <MicField onText={(said) => setCity(noDigits(address.city.trim() ? `${address.city.trim()} ${said}` : said).slice(0, MAX.place))}>
          <input value={address.city} maxLength={MAX.place} onChange={(e) => setCity(noDigits(e.target.value))} aria-invalid={show("city") || undefined} className={cn(input(show("city")), "pr-11")} />
        </MicField>
        </Field>
        <Field icon={MapPin} label={t("pin")} required={must} error={show("postalCode") && t(address.postalCode === "" ? "required" : "pinBad")}>
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
      </div>
      <div className="grid grid-cols-2 items-start gap-x-6 gap-y-3">
        <Field icon={Map} label={t("state")} required={must} error={show("state") && t("required")}>
          <PickMenu
            label={t("state")}
            current={address.stateCode ? (GST_STATES.find(([code]) => code === address.stateCode)?.[1] ?? address.state) : t("pick")}
            options={GST_STATES.map(([code, name]) => ({ id: code, name, hint: code }))}
            picked={address.stateCode ?? "29"}
            onPick={(code) => {
              if (code === address.stateCode) return;
              const state = GST_STATES.find(([c]) => c === code)![1];
              // a first pick keeps what's typed; a different state starts its place again
              if (address.stateCode === null) return onChange({ stateCode: code, state, district: inList(address.district, DISTRICTS[code]) ? address.district : "" });
              pinFromTown.current = "";
              onRestart?.();
              onChange({ stateCode: code, state, district: "", city: "", postalCode: "", addressLine1: "", addressLine2: "", landmark: "" });
            }}
            invalid={show("state")}
            searchable
            searchLabel={t("searchState")}
            noMatch={t("noState")}
          />
        </Field>
        <Field icon={MapPinned} label={t("district")} required={must} error={show("district") && t("required")}>
          {/* picked from the state's districts; a state with no list, like Other Territory, has it typed */}
          {address.stateCode && !districts ? (
            <MicField onText={(said) => onChange({ district: noDigits(address.district.trim() ? `${address.district.trim()} ${said}` : said).slice(0, MAX.place) })}>
            <input value={address.district} maxLength={MAX.place} onChange={(e) => onChange({ district: noDigits(e.target.value) })} aria-invalid={show("district") || undefined} className={cn(input(show("district")), "pr-11")} />
          </MicField>
          ) : (
            <PickMenu
              label={t("district")}
              current={address.district || t("pick")}
              options={districtOptions.map((name) => ({ id: name, name }))}
              picked={address.district}
              onPick={setDistrict}
              disabled={!address.stateCode}
              align="right"
              invalid={show("district")}
              searchable
              searchLabel={t("searchDistrict")}
              noMatch={t("noDistrict")}
              onTyped={(typed) => setDistrict(noDigits(typed).slice(0, MAX.place))}
              typedLabel={(text) => t("useTyped", { text })}
            />
          )}
        </Field>
      </div>

      {/* the address itself */}
      <div className="grid grid-cols-2 items-end gap-x-6 gap-y-3">
        <Field icon={House} label={t("line1")}>
          <MicField onText={(said) => onChange({ addressLine1: (address.addressLine1.trim() ? `${address.addressLine1.trim()} ${said}` : said).slice(0, MAX.line) })}>
            <input value={address.addressLine1} maxLength={MAX.line} onChange={(e) => onChange({ addressLine1: e.target.value })} className={cn(input(false), "pr-11")} />
          </MicField>
        </Field>
        <Field icon={Landmark} label={t("landmark")}>
          <MicField onText={(said) => onChange({ landmark: (address.landmark.trim() ? `${address.landmark.trim()} ${said}` : said).slice(0, MAX.landmark) })}>
            <input value={address.landmark} maxLength={MAX.landmark} onChange={(e) => onChange({ landmark: e.target.value })} className={cn(input(false), "pr-11")} />
          </MicField>
        </Field>
      </div>

      {/* GSTIN (its first two digits are the state's code) */}
      {!single && (
      <Field icon={ReceiptText} label={t("gstin")} className="mt-6 sm:w-56">
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
      )}
    </fieldset>
  );
}

// the party's fields: who it is and how to reach them, its addresses and remarks (its type comes from its sales and
// purchases), in two parts, personal details and addresses; its opening balance is set on the Opening balances page.
// `belowPhone` goes under the phone's row (a receipt shows the parties already added with that phone there); `onlyPhone`
// hides the rest (that phone is someone already added, shown in their place)
export function PartyFields({
  draft,
  onChange,
  tried,
  belowPhone,
  onlyPhone = false,
  belowName,
  strict = false,
  partyId = null,
  transporter = false,
  asksPaid = false,
  asksTds = false,
  asksRemarks = true,
  asksPan = true,
  onAddressesOpen,
  phoneOptional = false,
  asksTypes = false,
}: {
  draft: PartyDraft;
  onChange: (patch: Partial<PartyDraft>) => void;
  tried: boolean;
  belowPhone?: React.ReactNode;
  onlyPhone?: boolean;
  // under the name: parties with a similar name, as a suggestion
  belowName?: React.ReactNode;
  // a party added from a receipt: its phone and first address are needed too
  strict?: boolean;
  // the party being edited, so its own short name isn't taken by itself
  partyId?: string | null;
  // someone paid for transport: asks for a small transporter's declaration (never a customer or supplier)
  transporter?: boolean;
  // TDS is on this year: asks what they were paid outside this app, and the TDS already taken on it
  asksPaid?: boolean;
  asksTds?: boolean;
  // a payment has its own remarks, so someone added from one isn't asked
  asksRemarks?: boolean;
  // where TDS applies, the form asks for the PAN below the amount instead
  asksPan?: boolean;
  // the addresses have just come up, or one was started again: a Save pressed before that says nothing about them
  onAddressesOpen?: () => void;
  // someone paid legal or professional fees needn't give a phone
  phoneOptional?: boolean;
  // Entities and Accounts: what they are to us, as chips on top (a party added from a transaction gets its role from it)
  asksTypes?: boolean;
}) {
  const t = useTranslations("accounts.party.form");
  const bad = draftProblems(draft, strict, phoneOptional).party;
  const show = (field: keyof typeof bad) => tried && bad[field];
  // the addresses show once the full name is in (typing paused, Enter, left the name field, or spoken) and the phone is
  // valid, and stay
  const [nameDone, setNameDone] = useState(() => draft.name.trim() !== "");
  const [addressesOpen, setAddressesOpen] = useState(() => nameDone && !bad.phone);
  useEffect(() => {
    if (nameDone && !bad.phone) setAddressesOpen(true);
  }, [nameDone, bad.phone]);
  const showAddresses = addressesOpen;
  // on first showing they may open below the screen or the phone keyboard, so the form moves down to them
  const addressesRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(addressesOpen);
  useEffect(() => {
    if (!addressesOpen || wasOpen.current) return;
    wasOpen.current = true;
    onAddressesOpen?.();
    const section = addressesRef.current;
    const visible = window.visualViewport?.height ?? window.innerHeight;
    if (section && section.getBoundingClientRect().top > visible - 96) section.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [addressesOpen]);
  useEffect(() => {
    if (nameDone || draft.name.trim().length < 2) return;
    const wait = setTimeout(() => setNameDone(true), 700);
    return () => clearTimeout(wait);
  }, [draft.name, nameDone]);

  // the short name checked against the other parties once typing pauses: one that's taken shows red
  const short = draft.shortName.trim();
  const [askedShort, setAskedShort] = useState(short);
  useEffect(() => {
    const timer = setTimeout(() => setAskedShort(short), 300);
    return () => clearTimeout(timer);
  }, [short]);
  const shortCheck = trpc.accounts.party.nameCheck.useQuery({ shortName: askedShort, exceptId: partyId }, { enabled: askedShort !== "", staleTime: 0 });
  useEffect(() => {
    const found = shortCheck.data;
    if (!found || askedShort !== short) return;
    if (found.shortNameTaken !== draft.shortNameTaken) onChange({ shortNameTaken: found.shortNameTaken });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when an answer comes for what's typed now
  }, [shortCheck.data, askedShort, short]);

  // one address changed, added, removed or made the default
  const setAddress = (key: string, patch: Partial<AddressDraft>) => onChange({ addresses: draft.addresses.map((a) => (a.key === key ? { ...a, ...patch } : a)) });
  // a UPI ID changed, added or removed

  const removeAddress = (key: string) => {
    const left = draft.addresses.filter((a) => a.key !== key);
    onChange({ addresses: left.some((a) => a.isDefault) ? left : left.map((a, i) => ({ ...a, isDefault: i === 0 })) });
  };

  // what's still holding the next step back, by name, once the address is in (the labels without their "(optional)")
  const stillNeeded = (() => {
    const problems = draftProblems(draft, strict, phoneOptional);
    // only once the address's own must-haves are in: while it's being filled, nothing is wrong yet
    const addressIn = draft.addresses.some((a) => !blank(a) && a.city.trim() !== "" && a.district.trim() !== "" && a.stateCode !== null && /^\d{6}$/.test(a.postalCode));
    if (!strict || !addressIn) return [];
    const party = { phone: "phoneRequired", name: "name", shortName: "shortName", email: "email", pan: "pan" } as const;
    const place = { state: "state", district: "district", city: "city", postalCode: "pin", gstin: "gstin" } as const;
    const keys = [
      ...(Object.keys(party) as (keyof typeof party)[]).filter((k) => problems.party[k]).map((k) => party[k]),
      ...(Object.keys(place) as (keyof typeof place)[]).filter((k) => problems.addresses.some((p) => p?.[k])).map((k) => place[k]),
    ];
    return keys.map((k) => t(k).replace(/\s*\(.*\)$/, ""));
  })();

  // a spoken phone adds to a part already typed (a whole one is replaced)
  const phoneSoFar = draft.phone.length >= 10 ? "" : draft.phone;

  // the phone: red from a first digit no phone starts with, or once Save was tried
  const phoneBad = !!show("phone") || phoneStartsBad(draft.phone);
  const phone = (
    <Field icon={Phone} label={t(phoneOptional ? "phone" : "phoneRequired")} required={!phoneOptional}>
      <span className={cn("flex min-h-11 items-center gap-2 px-3", fieldClass(phoneBad))}>
        <span className="text-chestnut/70">+91</span>
        <input
          autoFocus
          aria-invalid={phoneBad || undefined}
          value={draft.phone}
          inputMode="tel"
          onChange={(e) => onChange({ phone: capPhone(e.target.value) })}
          className="tabular min-w-0 flex-1 bg-transparent text-base outline-none"
        />
        {/* spoken digit by digit: it listens through pauses until all 10 are in, adding to a part already there */}
        <MicButton
          onText={(said) => onChange({ phone: capPhone(phoneSoFar + spokenDigits(said)) })}
          until={(heard) => wholePhone(heard, phoneSoFar)}
        />
      </span>
      <span className={cn("text-xs", phoneBad ? "text-danger" : "text-chestnut/70")}>{phoneBad && draft.phone ? t("phoneBad") : t("phoneHint")}</span>
    </Field>
  );

  if (onlyPhone) {
    return (
      <div className="relative flex flex-col gap-2">
        {phone}
        {belowPhone}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* what they are to us: any of customer, supplier, employee, lender and agent (none for anyone else), as an
          accordion that folds to the picks */}
      {asksTypes && (
        <section className="flex flex-col gap-3">
          <h3 className={SECTION_TITLE}>{t("typesTitle")}</h3>
          <MultiAccordion
            label={t("typesTitle")}
            options={PICKED_ROLES.map((r) => ({ id: r, name: t(`types.${r}`) }))}
            value={draft.types}
            onChange={(types) => onChange({ types })}
            noneLabel={t("types.none")}
          />
          {/* an employee: their pay, each field the full width */}
          {draft.types.includes("employee") && <EmploymentFields draft={draft} onChange={onChange} tried={tried} />}
        </section>
      )}
      {/* personal details: phone and email in a row where both fit, then name and short name, then the PAN set apart */}
      <section className="@container flex flex-col gap-3">
        <h3 className={SECTION_TITLE}>{t("personal")}</h3>
        <div className="flex flex-col gap-4 @md:flex-row @md:items-start @md:gap-8">
        <ProfilePhoto />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="relative grid grid-cols-1 items-start gap-x-6 gap-y-3 @md:grid-cols-2">
          {phone}
          <Field icon={Mail} label={t("email")}>
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
          {belowPhone && <div className="col-span-full">{belowPhone}</div>}
        </div>
        <div className="relative grid grid-cols-1 items-start gap-x-6 gap-y-3 @md:grid-cols-2">
          <Field icon={User} label={t("name")} required error={show("name") && t("required")}>
            <MicField
              onText={(said) => {
                const name = noDigits(draft.name.trim() ? `${draft.name.trim()} ${said}` : said).slice(0, MAX.name);
                onChange({ name });
                if (name.trim()) setNameDone(true);
              }}
            >
              <input
                value={draft.name}
                maxLength={MAX.name}
                onChange={(e) => {
                  const name = noDigits(e.target.value);
                  onChange({ name });
                }}
                onBlur={() => draft.name.trim() && setNameDone(true)}
                onKeyDown={(e) => e.key === "Enter" && draft.name.trim() && (e.preventDefault(), setNameDone(true))}
                aria-invalid={show("name") || undefined}
                className={cn(input(show("name")), "pr-11")}
              />
            </MicField>
          </Field>
          {/* the short name ledgers and lists show (optional; without it they show the full name) */}
          <Field icon={Tag} label={t("shortName")} error={draft.shortNameTaken && t("shortNameTaken")}>
            <input
              value={draft.shortName}
              maxLength={MAX.shortName}
              autoCapitalize="characters"
              onChange={(e) => onChange({ shortName: e.target.value.toUpperCase().replace(/[^A-Z0-9 &.-]/g, ""), shortNameTaken: false })}
              placeholder="SRT"
              aria-invalid={show("shortName") || draft.shortNameTaken || undefined}
              className={cn(input(show("shortName") || draft.shortNameTaken), "uppercase")}
            />
          </Field>
          {belowName && <div className="col-span-full">{belowName}</div>}
        </div>
        </div>
        </div>

        {asksPan && (
          <Field icon={IdCard} label={t("pan")} className="mt-6 sm:w-56">
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
        )}

        {/* a small transporter (10 or fewer trucks) who gave their PAN and a declaration: no TDS on its transport */}
        {transporter && (
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={draft.transportDeclaration}
              onChange={(e) => onChange({ transportDeclaration: e.target.checked })}
              className="mt-0.5 size-5 shrink-0 accent-chestnut"
            />
            <span className="flex flex-col gap-0.5">
              <span>{t("transportDeclaration")}</span>
              <span className="text-xs text-chestnut/70">{t("transportDeclarationHint")}</span>
            </span>
          </label>
        )}

        {/* paid this year outside this app, which counts towards TDS limits */}
        {asksPaid && (
          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <Field icon={Wallet} label={t("paidBefore")}>
                <NumberInput value={draft.paidBefore} decimals={2} onChange={(paidBefore) => onChange({ paidBefore })} className={cn(input(false), "tabular")} />
              </Field>
              {asksTds && (
                <Field icon={Percent} label={t("tdsBefore")} error={tdsOver(draft) && t("tdsOver")}>
                  <NumberInput value={draft.tdsBefore} decimals={2} onChange={(tdsBefore) => onChange({ tdsBefore })} aria-invalid={tdsOver(draft) || undefined} className={cn(input(tdsOver(draft)), "tabular")} />
                </Field>
              )}
            </div>
            <span className="text-xs text-chestnut/70">{t("paidBeforeHint")}</span>
          </div>
        )}
      </section>

      {/* the addresses, each with its own PIN lookup */}
      {showAddresses && (
        <section ref={addressesRef} className="mt-8 flex flex-col gap-3">
          <h3 className={SECTION_TITLE}>{t("addresses")}</h3>
          {draft.addresses.map((a, i) => (
            <AddressFields
              key={a.key}
              address={a}
              index={i}
              count={draft.addresses.length}
              tried={tried}
              required={strict && i === 0}
              onChange={(patch) => setAddress(a.key, patch)}
              onRestart={onAddressesOpen}
              onRemove={() => removeAddress(a.key)}
              onMakeDefault={() => onChange({ addresses: draft.addresses.map((x) => ({ ...x, isDefault: x.key === a.key })) })}
            />
          ))}
          {draft.addresses.length < MAX_ADDRESSES && (
            <button
              type="button"
              onClick={() => onChange({ addresses: [...draft.addresses, emptyAddress(draft.addresses.length === 0)] })}
              className={cn(ADD_ON_IVORY, "px-5 sm:w-auto sm:self-center")}
            >
              <Plus className="size-4" aria-hidden /> {t("addAddress")}
            </button>
          )}
          {stillNeeded.length > 0 && <FieldMessage className="mt-0">{t("stillNeeded", { fields: stillNeeded.join(", ") })}</FieldMessage>}
        </section>
      )}


      {asksRemarks && (
        <Field icon={MessageSquare} label={t("remarks")}>
          <textarea value={draft.remarks} maxLength={MAX.remarks} rows={2} onChange={(e) => onChange({ remarks: e.target.value })} className={cn(input(false), "py-2.5")} />
        </Field>
      )}
    </div>
  );
}

// the UPI IDs someone is paid on, for a payment's QR: one box always there, then "Add UPI ID" for another (up to `max`)
export function UpiIdsField({ upiIds, onChange, tried, max = 5 }: { upiIds: PartyDraft["upiIds"]; onChange: (upiIds: PartyDraft["upiIds"]) => void; tried: boolean; max?: number }) {
  const t = useTranslations("accounts.party.form");
  // with none yet, an empty box stands in for the first; typing in it makes it a real one
  const rows = upiIds.length > 0 ? upiIds : [{ key: "upi-blank", upiId: "" }];
  const setUpi = (key: string, upiId: string) =>
    onChange(upiIds.length === 0 ? [{ key: newKey(), upiId }] : upiIds.map((u) => (u.key === key ? { ...u, upiId } : u)));
  return (
    <div className="flex flex-col gap-2.5">
      <span className="flex items-center gap-1.5 text-xs font-semibold">
        <QrCode className="size-3.5 shrink-0 opacity-70" aria-hidden />
        {t("upiIds")}
      </span>
      {rows.map((u) => {
        const wrong = tried && upiIds.length > 0 && upiBad({ upiIds }, u.key);
        return (
          <div key={u.key} className="flex flex-col gap-1.5 sm:w-96">
            <div className="flex items-center gap-2">
              <input
                value={u.upiId}
                maxLength={255}
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => setUpi(u.key, e.target.value.toLowerCase().replace(/[^a-z0-9.@_-]/g, ""))}
                placeholder="name@okhdfcbank"
                aria-label={t("upiIds")}
                aria-invalid={wrong || undefined}
                className={input(wrong)}
              />
              {/* the first box stays; the ones added after it can go */}
              {rows.length > 1 && (
                <button type="button" onClick={() => onChange(upiIds.filter((x) => x.key !== u.key))} aria-label={t("removeUpi")} className="grid size-11 shrink-0 place-items-center rounded-control hover:bg-chestnut/[0.06]">
                  <Trash2 className="size-4" aria-hidden />
                </button>
              )}
            </div>
            {wrong && <FieldMessage className="mt-0">{t("upiBad")}</FieldMessage>}
          </div>
        );
      })}
      {rows.length < max && (
        <button
          type="button"
          onClick={() => onChange([...(upiIds.length > 0 ? upiIds : [{ key: newKey(), upiId: "" }]), { key: newKey(), upiId: "" }])}
          className={cn(ADD_ON_IVORY, "self-start")}
        >
          <Plus className="size-4" aria-hidden /> {t("addUpi")}
        </button>
      )}
    </div>
  );
}

// a new UPI row's key, for forms outside this file
export const upiKey = () => newKey();

// an employee's pay: the day they joined (never after today), monthly salary (₹, grouped as it's typed), and the day of
// the month it falls due (1 to 31)
function EmploymentFields({ draft, onChange, tried }: { draft: PartyDraft; onChange: (patch: Partial<PartyDraft>) => void; tried: boolean }) {
  const t = useTranslations("accounts.party.form");
  const bad = employmentProblems(draft);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  return (
    <div className="flex flex-col gap-3">
      <label className="flex min-w-0 flex-col gap-2 text-xs font-semibold">
        <span>
          {t("joiningDate")}
          <RequiredMark />
        </span>
        <DateInput
          value={draft.joiningDate}
          max={today}
          onChange={(d) => onChange({ joiningDate: d !== "" && d > today ? draft.joiningDate : d })}
          calendarLabel={t("joiningDate")}
          aria-invalid={(tried && bad.joiningDate) || undefined}
          className={input(tried && bad.joiningDate)}
        />
      </label>
      <label className="flex min-w-0 flex-col gap-2 text-xs font-semibold">
        <span>
          {t("monthlySalary")}
          <RequiredMark />
        </span>
        <NumberInput
          value={draft.monthlySalary}
          onChange={(v) => onChange({ monthlySalary: v })}
          decimals={2}
          maxDigits={13}
          placeholder="0"
          aria-invalid={(tried && bad.monthlySalary) || undefined}
          className={cn(input(tried && bad.monthlySalary), "tabular")}
        />
      </label>
      <label className="flex min-w-0 flex-col gap-2 text-xs font-semibold">
        <span>
          {t("payDay")}
          <RequiredMark />
        </span>
        <NumberInput
          value={draft.payDay}
          onChange={(v) => onChange({ payDay: v })}
          maxDigits={2}
          max={31}
          placeholder="1"
          aria-invalid={(tried && bad.payDay) || undefined}
          className={cn(input(tried && bad.payDay), "tabular")}
        />
      </label>
    </div>
  );
}

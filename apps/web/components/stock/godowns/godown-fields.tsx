"use client";

import { useTranslations } from "next-intl";

import { fieldClass } from "~/components/ui/card-form";
import { NumberInput } from "~/components/ui/number-input";
import { cn } from "~/lib/utils";
import type { RouterOutputs } from "@repo/trpc/client";

export type Godown = RouterOutputs["inventory"]["godown"]["get"];

// a godown's details as typed; lengths follow the godowns table (name 20, landlord 255, phone 20)
export type GodownDraft = {
  godownName: string;
  address: string;
  ownership: "rented" | "owned";
  rent: string;
  rentEvery: string;
  usedFrom: string;
  landlordName: string;
  landlordNumber: string;
};

export const NAME_MAX = 20;
const ADDRESS_MAX = 500;
const LANDLORD_MAX = 255;
const PHONE_MAX = 20;

export const emptyDraft = (): GodownDraft => ({
  godownName: "",
  address: "",
  ownership: "rented",
  rent: "",
  rentEvery: "1",
  usedFrom: "",
  landlordName: "",
  landlordNumber: "",
});

// an existing godown as a draft (dates arrive as text from the API)
export const draftFrom = (g: Godown): GodownDraft => ({
  godownName: g.godownName,
  address: g.address ?? "",
  ownership: g.ownership,
  rent: g.rent == null ? "" : String(g.rent),
  rentEvery: g.rentTimingInMonths == null ? "" : String(g.rentTimingInMonths),
  usedFrom: g.usedFrom ? new Date(g.usedFrom).toISOString().slice(0, 10) : "",
  landlordName: g.landlordName ?? "",
  landlordNumber: g.landlordNumber ?? "",
});

// what's missing or wrong, field by field
export function draftProblems(d: GodownDraft) {
  const rented = d.ownership === "rented";
  return {
    godownName: d.godownName.trim() === "" || d.godownName.trim().length > NAME_MAX,
    address: d.address.trim().length > ADDRESS_MAX,
    rent: rented && !(/^\d+(\.\d{1,2})?$/.test(d.rent.trim()) && Number(d.rent) > 0),
    rentEvery: rented && d.rentEvery.trim() !== "" && !(/^\d+$/.test(d.rentEvery.trim()) && Number(d.rentEvery) >= 1 && Number(d.rentEvery) <= 120),
    landlordName: rented && (d.landlordName.trim() === "" || d.landlordName.trim().length > LANDLORD_MAX),
    landlordNumber: rented && !/^\d{0,20}$/.test(d.landlordNumber.trim()),
  };
}

export const draftOk = (d: GodownDraft) => Object.values(draftProblems(d)).every((bad) => !bad);

// the draft as the API takes it; an owned godown sends no rental details (the server drops them too)
export function draftInput(d: GodownDraft) {
  const rented = d.ownership === "rented";
  const phone = rented ? d.landlordNumber.trim() : "";
  return {
    godownName: d.godownName.trim(),
    address: d.address.trim(),
    ownership: d.ownership,
    rent: rented ? Number(d.rent) : null,
    rentTimingInMonths: rented && d.rentEvery.trim() !== "" ? Number(d.rentEvery) : null,
    usedFrom: d.usedFrom || null,
    landlordName: rented ? d.landlordName.trim() : "",
    landlordCountryCode: phone ? "+91" : "",
    landlordNumber: phone,
  };
}

const input = (bad: boolean) => `min-h-11 w-full min-w-0 px-3 text-base placeholder:text-chestnut/60 ${fieldClass(bad)}`;

// the details fields: name, address, owned or rented (rented adds rent, how often, landlord), in use from
export function GodownFields({
  draft,
  onChange,
  tried,
}: {
  draft: GodownDraft;
  onChange: (patch: Partial<GodownDraft>) => void;
  tried: boolean;
}) {
  const t = useTranslations("stock.form");
  const bad = draftProblems(draft);
  const show = (field: keyof typeof bad) => tried && bad[field];
  const chip = (on: boolean) =>
    cn("min-h-11 flex-1 rounded-control border text-sm transition-colors", on ? "border-chestnut bg-chestnut font-medium text-ivory" : "border-chestnut/60 hover:border-chestnut");

  return (
    <div className="flex flex-col gap-5">
      {/* name and address */}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm">{t("name")}</span>
        <input
          autoFocus
          value={draft.godownName}
          maxLength={NAME_MAX}
          onChange={(e) => onChange({ godownName: e.target.value })}
          placeholder={t("namePlaceholder")}
          aria-invalid={show("godownName") || undefined}
          className={input(show("godownName"))}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm">{t("address")}</span>
        <textarea
          value={draft.address}
          maxLength={ADDRESS_MAX}
          rows={2}
          onChange={(e) => onChange({ address: e.target.value })}
          className={cn(input(show("address")), "py-2.5")}
        />
      </label>

      {/* owned or rented */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm">{t("ownership")}</legend>
        <div className="flex gap-2">
          {(["rented", "owned"] as const).map((o) => (
            <button key={o} type="button" aria-pressed={draft.ownership === o} onClick={() => onChange({ ownership: o })} className={chip(draft.ownership === o)}>
              {t(o)}
            </button>
          ))}
        </div>
      </fieldset>

      {/* rented: the rent and how often it's paid, then the landlord */}
      {draft.ownership === "rented" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-sm">{t("rent")}</span>
              <NumberInput
                value={draft.rent}
                decimals={2}
                onChange={(v) => onChange({ rent: v })}
                placeholder="25000"
                aria-invalid={show("rent") || undefined}
                className={cn(input(show("rent")), "tabular")}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="truncate text-sm">{t("rentEvery")}</span>
              <NumberInput
                value={draft.rentEvery}
                maxDigits={3}
                onChange={(v) => onChange({ rentEvery: v })}
                aria-invalid={show("rentEvery") || undefined}
                className={cn(input(show("rentEvery")), "tabular")}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm">{t("landlord")}</span>
            <input
              value={draft.landlordName}
              maxLength={LANDLORD_MAX}
              onChange={(e) => onChange({ landlordName: e.target.value })}
              aria-invalid={show("landlordName") || undefined}
              className={input(show("landlordName"))}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm">{t("landlordPhone")}</span>
            <span className={cn("flex min-h-11 items-center gap-2 px-3", fieldClass(show("landlordNumber")))}>
              <span className="text-chestnut/70">+91</span>
              <input
                value={draft.landlordNumber}
                inputMode="tel"
                maxLength={PHONE_MAX}
                onChange={(e) => onChange({ landlordNumber: e.target.value.replace(/\D/g, "") })}
                className="tabular min-w-0 flex-1 bg-transparent text-base outline-none"
              />
            </span>
          </label>
        </>
      )}

      {/* in use from */}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm">{t("usedFrom")}</span>
        <input type="date" value={draft.usedFrom} onChange={(e) => onChange({ usedFrom: e.target.value })} className={input(false)} />
      </label>
    </div>
  );
}

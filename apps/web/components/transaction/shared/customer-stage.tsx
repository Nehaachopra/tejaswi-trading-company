"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ComponentProps, type Dispatch, type ReactNode, type SetStateAction, useState } from "react";

import { fieldClass } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { ADD_ON_IVORY } from "~/components/ui/page-styles";
import { RequiredMark } from "~/components/ui/required-mark";
import { noDigits } from "~/lib/format";
import { cn } from "~/lib/utils";

import { type AddressDraft, AddressFields, emptyAddress, FieldRows, SECTION_TITLE } from "../../account/party/party-fields";
import { LedgerSearch } from "../pickers/ledger-picker";
import { PartyFace, PartyPick } from "../pickers/party-finder";
import { chip, fieldRow } from "./form-basics";
import { PartyEditor } from "./party-editor";
import { PickedCard } from "./picked-card";

type Search = ComponentProps<typeof LedgerSearch>;
type Ledger = NonNullable<ComponentProps<typeof PartyPick>["ledger"]>;

// the customer stage shared by sale, purchase, sale order and purchase order. Its first view: a search over the
// parties (the list, and + New party), the picked one with Edit (the admin changes their details right here) and
// Change (none on a dispatch or an arrival: the order's party stays); someone new shows "New party" with Change, then
// their details (the transaction's own form); a phone one of ours already has shows them instead (use them, or change
// the phone). Back on the stage once their details are complete (after Next), someone new shows as a picked one does:
// who they are, with Edit (their form again) and Change (back to the search)
export function PartySearchView({
  search,
  editor,
  noAddress,
  newPartyCard = false,
  form,
  match,
  afterMatch,
  newDone,
  onNewChange,
}: {
  // the search, as LedgerSearch takes it (+ New party always offered where it may add); none: only the new party's
  // details (a cash purchase)
  search?: Omit<Search, "addParty"> | null;
  // the picked one's details, changed right here
  editor?: { open: boolean; ledger: Ledger; setLedger: (l: Ledger) => void; close: () => void } | null;
  // the picked one has no address: what to say
  noAddress?: string | null;
  // someone new: "New party" with Change above their details (back to the search)
  newPartyCard?: boolean;
  // someone new: their details
  form?: ReactNode;
  // a phone one of ours already has
  match?: { ledger: Ledger; onUse: () => void; onChangePhone: () => void } | null;
  // what comes after that (an order's customer: where to deliver)
  afterMatch?: ReactNode;
  // someone new: whether their details are complete, and who they are as a pick shows them
  newDone?: { complete: boolean; face: ComponentProps<typeof PartyFace> } | null;
  // someone new: what Change does (back to the search unless given; null: no Change, as an order's buyer)
  onNewChange?: (() => void) | null;
}) {
  const tpick = useTranslations("transactions.picker");
  // the new party's form shows until their details are complete when the stage opens; Edit opens it again
  const [formOpen, setFormOpen] = useState(() => !newDone?.complete);
  // Change for someone new: let go of them (and their form shows again for the next one)
  const changeNew =
    onNewChange === null
      ? undefined
      : () => {
          setFormOpen(true);
          if (onNewChange) onNewChange();
          else search?.onChange(null);
        };
  if (newDone && newDone.complete && !formOpen)
    return (
      <div className="flex flex-col gap-4">
        <PickedCard
          onEdit={() => setFormOpen(true)}
          onChange={onNewChange || search ? changeNew : undefined}
        >
          <PartyFace {...newDone.face} />
        </PickedCard>
      </div>
    );
  return (
    <div className="flex flex-col gap-4">
      {search && <LedgerSearch {...(search as Search)} addParty />}

      {/* the picked one's details, changed right here */}
      {editor?.open && <PartyEditor rows ledger={editor.ledger} setLedger={editor.setLedger} close={editor.close} />}
      {/* one with no address */}
      {noAddress && !editor?.open && (
        <FieldMessage tone="warning" className="mt-0">
          {noAddress}
        </FieldMessage>
      )}

      {/* someone new: Change goes back to the search, to pick one already added */}
      {newPartyCard && (
        <PickedCard oneLine onChange={onNewChange || search ? changeNew : undefined}>
          <span className="min-w-0 flex-1 truncate font-semibold">{tpick("newParty")}</span>
        </PickedCard>
      )}

      {form}
      {match && <MatchBox {...match} />}
      {afterMatch}
    </div>
  );
}

// a phone one of ours already has: them, with Use them and Change phone, as in a payment
function MatchBox({ ledger, onUse, onChangePhone }: { ledger: Ledger; onUse: () => void; onChangePhone: () => void }) {
  const tc = useTranslations("transactions.chat");
  const tp = useTranslations("transactions.payment.form");
  if (!ledger.party) return null;
  return (
    <div className="flex flex-col gap-3 rounded-control border border-chestnut/40 bg-chestnut/4 p-3">
      <span className="text-xs font-semibold">{tc("q.phoneMatch")}</span>
      <PartyPick ledger={ledger} party={ledger.party} />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onUse} className={chip(true)}>
          {tp("useThem")}
        </button>
        <button type="button" onClick={onChangePhone} className={chip(false)}>
          {tc("changePhone")}
        </button>
      </div>
    </div>
  );
}

// the name and phone rows, under Personal details: typed, or shown as fixed (an order's buyer); the phone with +91
export function PersonalRows({
  name,
  setName,
  phone,
  setPhone,
  nameFixed = false,
  phoneFixed = false,
  nameRequired,
  phoneRequired,
  nameBad,
  phoneBad,
  phoneBadText,
  nameLabel,
  phoneLabel,
  phoneFirst = false,
  focusName = false,
}: {
  name: string;
  setName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  nameFixed?: boolean;
  phoneFixed?: boolean;
  nameRequired: boolean;
  phoneRequired: boolean;
  nameBad: boolean;
  phoneBad: boolean;
  phoneBadText: string;
  // the name's label ("Full name" unless given)
  nameLabel?: string;
  phoneLabel: string;
  // the phone on top, the cursor in it (one of ours with it shows them instead)
  phoneFirst?: boolean;
  // the name first, the cursor in it
  focusName?: boolean;
}) {
  const tf = useTranslations("accounts.party.form");
  const nameRow = (
    <label key="name" className={fieldRow}>
      <span>
        {nameLabel ?? tf("name")}
        {nameRequired && !nameFixed && <RequiredMark />}
      </span>
      {nameFixed ? (
        <span className="flex min-h-11 items-center break-words text-base font-semibold">{name}</span>
      ) : (
        <input
          autoFocus={focusName}
          value={name}
          maxLength={150}
          onChange={(e) => setName(noDigits(e.target.value))}
          aria-invalid={nameBad || undefined}
          className={cn(fieldClass(nameBad), "min-h-11 min-w-0 px-3 text-base")}
        />
      )}
    </label>
  );
  const phoneRow = (
    <label key="phone" className={fieldRow}>
      <span>
        {phoneLabel}
        {phoneRequired && !phoneFixed && <RequiredMark />}
      </span>
      {phoneFixed ? (
        <span className="tabular flex min-h-11 items-center text-base font-semibold">+91 {phone}</span>
      ) : (
        <span className={cn("flex min-h-11 min-w-0 items-center gap-2 px-3", fieldClass(phoneBad))}>
          <span className="text-chestnut/70">+91</span>
          <input
            autoFocus={phoneFirst}
            value={phone}
            inputMode="tel"
            aria-invalid={phoneBad || undefined}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            className="tabular min-w-0 flex-1 bg-transparent text-base outline-none"
          />
        </span>
      )}
      {!phoneFixed && phoneBad && <FieldMessage className="mt-0">{phoneBadText}</FieldMessage>}
    </label>
  );
  return (
    <section className="flex flex-col gap-3">
      <h3 className={SECTION_TITLE}>{tf("personal")}</h3>
      {/* side by side (one under the other on a phone); phone first: each in the left column */}
      <div className={cn("grid grid-cols-1 items-start gap-x-6 gap-y-3 sm:grid-cols-2", phoneFirst && "sm:*:col-start-1")}>
        {phoneFirst ? [phoneRow, nameRow] : [nameRow, phoneRow]}
      </div>
    </section>
  );
}

// the customer stage's second view (cash): only the address, our place of business until changed, used for billing
// and shipping; `personal` above it when the name and phone are needed too. "Ship to a different address" adds a second
// box for where it goes, which can be removed and can't be the same place as the first (said once, by Next)
export function AddressOnlyView({
  personal,
  addresses,
  setAddresses,
  tried,
  setTried,
  complete,
  onChange,
}: {
  // the stage's answers are complete: back on it, only the location shows (Edit opens the form again)
  complete: boolean;
  // Change: from the address alone to the search (a sale: find a saved customer)
  onChange?: () => void;
  personal?: ReactNode;
  addresses: AddressDraft[];
  setAddresses: Dispatch<SetStateAction<AddressDraft[]>>;
  tried: boolean;
  setTried: (v: boolean) => void;
}) {
  const t = useTranslations("transactions.sale");
  const setAddress = (key: string, patch: Partial<AddressDraft>) => setAddresses((all) => all.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  const ships = addresses.length > 1;
  const [formOpen, setFormOpen] = useState(() => !complete);
  // back on the stage with the address complete: shown as a picked party is, with Edit and Change
  const first = addresses[0];
  if (complete && !formOpen && first)
    return (
      <PickedCard onEdit={() => setFormOpen(true)} onChange={onChange}>
        {/* as a picked party shows: no name yet (–), Customer, and the town entered */}
        <PartyFace name="–" shortName={null} types={["customer"]} phone={null} city={first.city || null} />
      </PickedCard>
    );
  return (
    <div className="flex flex-col gap-6">
      {personal}

      {/* the address: one for billing and shipping (with its GSTIN); a second, where it ships, when asked for */}
      <FieldRows>
        {addresses.map((a, i) => (
          <section key={a.key} className="flex flex-col gap-3">
            <div className="flex min-h-9 items-center justify-between gap-3">
              <h3 className={SECTION_TITLE}>{t(i === 1 ? "shippingAddress" : ships ? "billingAddress" : "billShipAddress")}</h3>
              {i === 1 && (
                <button
                  type="button"
                  onClick={() => setAddresses((all) => all.slice(0, 1))}
                  aria-label={t("removeShipping")}
                  className="grid size-9 place-items-center rounded-control border border-chestnut/50 hover:border-chestnut"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              )}
            </div>
            <AddressFields
              address={a}
              index={i}
              count={addresses.length}
              tried={tried}
              required
              // no name, use or default to pick: the first is billed, the second is where it goes (and has no GSTIN)
              single={i === 1}
              noHeader
              onChange={(patch) => setAddress(a.key, patch)}
              onRestart={() => setTried(false)}
              onRemove={() => undefined}
              onMakeDefault={() => undefined}
            />
          </section>
        ))}
      </FieldRows>
      {!ships && (
        <button type="button" onClick={() => setAddresses((all) => [...all, emptyAddress(false)])} className={cn(ADD_ON_IVORY, "px-5 sm:self-center")}>
          <Plus className="size-4" aria-hidden /> {t("shipElsewhere")}
        </button>
      )}
    </div>
  );
}

// an order's new party (sale order and purchase order alike): the name first (needed), the phone (optional: asked when
// the order is shared if left out), then where they are once the name is in: one address, the town filling in the PIN,
// district and state. A phone one of ours already has shows them instead, above the address
export function OrderPartyForm({
  name,
  setName,
  phone,
  setPhone,
  address,
  setAddress,
  tried,
  match,
}: {
  name: string;
  setName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  address: AddressDraft;
  setAddress: (patch: Partial<AddressDraft>) => void;
  tried: boolean;
  match?: { ledger: Ledger; onUse: () => void; onChangePhone: () => void } | null;
}) {
  const t = useTranslations("orders");
  const tf = useTranslations("accounts.party.form");
  return (
    <>
      <PersonalRows
        focusName
        name={name}
        setName={setName}
        phone={phone}
        setPhone={setPhone}
        nameRequired
        phoneRequired={false}
        nameBad={tried && name.trim() === ""}
        phoneBad={/^[0-5]/.test(phone) || (tried && phone !== "" && phone.length < 10)}
        phoneBadText={t("done.mobileBad")}
        nameLabel={t("customer.name")}
        phoneLabel={t("customer.phone")}
      />
      {match && <MatchBox {...match} />}
      {name.trim() !== "" && !match && (
        <section className="flex flex-col gap-3">
          <h3 className={SECTION_TITLE}>{tf("addresses")}</h3>
          <FieldRows>
            <AddressFields
              single
              required
              address={address}
              index={0}
              count={1}
              tried={tried}
              onChange={setAddress}
              onRemove={() => undefined}
              onMakeDefault={() => undefined}
            />
          </FieldRows>
        </section>
      )}
    </>
  );
}

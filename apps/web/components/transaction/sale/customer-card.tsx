"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { fieldClass } from "~/components/ui/card-form";
import { FieldMessage } from "~/components/ui/field-message";
import { ADD_ON_IVORY } from "~/components/ui/page-styles";
import { RequiredMark } from "~/components/ui/required-mark";
import { noDigits } from "~/lib/format";
import { cn } from "~/lib/utils";

import { AddressFields, emptyAddress, emptyDraft, FieldRows, PartyFields, SECTION_TITLE } from "../../account/party/party-fields";
import { LedgerSearch } from "../pickers/ledger-picker";
import { PartyPick } from "../pickers/party-finder";
import { chip, fieldRow } from "../shared/form-basics";
import { PartyEditor } from "../shared/party-editor";
import { useSaleEntry } from "./state";

// a cash buyer's addresses, at most
const MOST_ADDRESSES = 5;

// the Customer card, as a receipt's Received from: a search over the customers, the picked one with Edit and Change
// (the admin edits their details right here). + New party asks the details right here: on credit a new customer's, as
// a payment adds someone (the admin's; a phone someone already has shows them instead: use them, or change the phone);
// for cash the buyer's name, phone and addresses, kept on the sale only
export function CustomerCard() {
  const { t, kind, isAdmin, customer, setCustomer, newParty, setNewParty, editingCustomer, setEditingCustomer, matched, tried, setTried } = useSaleEntry();
  const tc = useTranslations("transactions.chat");
  const tpf = useTranslations("transactions.payment.form");
  const picked = customer?.kind === "ledger" ? customer.ledger : null;
  return (
    <div className="flex flex-col gap-4">
      <LedgerSearch
        purpose="receipt"
        receiptKind="customer"
        value={customer}
        onChange={(c) => {
          setCustomer(c);
          setEditingCustomer(false);
          if (c?.kind === "party") setNewParty(emptyDraft());
        }}
        // a cash buyer is only kept on the sale, so anyone may type one; a new customer on credit is the admin's
        canAdd={isAdmin || kind === "cash"}
        addParty
        onEdit={isAdmin && picked?.party ? () => setEditingCustomer((on) => !on) : undefined}
        placeholder={tc("hints.from")}
      />

      {/* the picked one's details, changed right here */}
      {editingCustomer && picked?.party && (
        <PartyEditor ledger={picked} setLedger={(ledger) => setCustomer({ kind: "ledger", ledger })} close={() => setEditingCustomer(false)} />
      )}
      {/* one with no address: the goods need somewhere to go */}
      {picked?.party && !picked.party.city && !editingCustomer && <FieldMessage tone="warning" className="mt-0">{t("noAddress")}</FieldMessage>}

      {/* someone new, for cash: the buyer's details */}
      {customer?.kind === "party" && kind === "cash" && <CashBuyer />}

      {/* someone new, on credit: a new customer's details */}
      {customer?.kind === "party" && kind === "credit" && (
        <>
          <PartyFields
            draft={newParty}
            onChange={(patch) => setNewParty((d) => ({ ...d, ...patch }))}
            tried={tried}
            strict
            asksRemarks={false}
            onAddressesOpen={() => setTried(false)}
            onlyPhone={!!matched}
            rows
          />
          {matched?.party && (
            <div className="flex flex-col gap-3 rounded-control border border-chestnut/40 bg-chestnut/4 p-3">
              <span className="text-xs font-semibold">{tc("q.phoneMatch")}</span>
              <PartyPick ledger={matched} party={matched.party} />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setCustomer({ kind: "ledger", ledger: matched })} className={chip(true)}>
                  {tpf("useThem")}
                </button>
                <button type="button" onClick={() => setNewParty((d) => ({ ...d, phone: "" }))} className={chip(false)}>
                  {tc("changePhone")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// for cash: the buyer's full name and phone side by side (one under the other on a phone), needed from ₹50,000 taxable
// value and optional below it; then their addresses, each in its box as a party's (our place of business first, until
// changed), with Add address under them
function CashBuyer() {
  const { t, buyerName, setBuyerName, buyerPhone, setBuyerPhone, phoneOk, buyerNeeded, addresses, setAddresses, tried, setTried } = useSaleEntry();
  const tf = useTranslations("accounts.party.form");
  const nameBad = tried && buyerNeeded && buyerName.trim() === "";
  const phoneBad = /^[0-5]/.test(buyerPhone) || (tried && (!phoneOk || (buyerNeeded && buyerPhone === "")));
  const setAddress = (key: string, patch: Partial<(typeof addresses)[number]>) => setAddresses((all) => all.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  const removeAddress = (key: string) =>
    setAddresses((all) => {
      const left = all.filter((a) => a.key !== key);
      return left.some((a) => a.isDefault) ? left : left.map((a, i) => ({ ...a, isDefault: i === 0 }));
    });
  return (
    <div className="flex flex-col gap-6">
      {/* personal details, under their heading */}
      <section className="flex flex-col gap-3">
        <h3 className={SECTION_TITLE}>{tf("personal")}</h3>
        <div className="grid grid-cols-1 items-start gap-x-6 gap-y-3 sm:grid-cols-2">
          <label className={fieldRow}>
            <span>
              {tf("name")}
              {buyerNeeded && <RequiredMark />}
            </span>
            <input
              value={buyerName}
              maxLength={150}
              onChange={(e) => setBuyerName(noDigits(e.target.value))}
              aria-invalid={nameBad || undefined}
              className={cn(fieldClass(nameBad), "min-h-11 min-w-0 px-3 text-base")}
            />
          </label>
          <label className={fieldRow}>
            <span>
              {t("phone")}
              {buyerNeeded && <RequiredMark />}
            </span>
            <span className={cn("flex min-h-11 min-w-0 items-center gap-2 px-3", fieldClass(phoneBad))}>
              <span className="text-chestnut/70">+91</span>
              <input
                value={buyerPhone}
                inputMode="tel"
                aria-invalid={phoneBad || undefined}
                onChange={(e) => setBuyerPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                className="tabular min-w-0 flex-1 bg-transparent text-base outline-none"
              />
            </span>
            {phoneBad && <FieldMessage className="mt-0">{t("phoneBad")}</FieldMessage>}
          </label>
        </div>
      </section>

      {/* the addresses, each in its box, then Add address */}
      <section className="flex flex-col gap-3">
        <h3 className={SECTION_TITLE}>{tf("addresses")}</h3>
        <FieldRows>
          {addresses.map((a, i) => (
            <AddressFields
              key={a.key}
              address={a}
              index={i}
              count={addresses.length}
              tried={tried}
              required
              onChange={(patch) => setAddress(a.key, patch)}
              onRestart={() => setTried(false)}
              onRemove={() => removeAddress(a.key)}
              onMakeDefault={() => setAddresses((all) => all.map((x) => ({ ...x, isDefault: x.key === a.key })))}
            />
          ))}
        </FieldRows>
        {addresses.length < MOST_ADDRESSES && (
          <button
            type="button"
            onClick={() => setAddresses((all) => [...all, emptyAddress(false)])}
            className={cn(ADD_ON_IVORY, "px-5 sm:w-auto sm:self-center")}
          >
            <Plus className="size-4" aria-hidden /> {tf("addAddress")}
          </button>
        )}
      </section>
    </div>
  );
}

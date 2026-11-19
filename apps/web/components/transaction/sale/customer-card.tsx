"use client";

import { Plus, Trash2 } from "lucide-react";
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

// the Customer card, as a receipt's Received from: a search over the customers, the picked one with Edit and Change
// (the admin edits their details right here). + New party asks the details right here: on credit a new customer's, as
// a payment adds someone (the admin's; a phone someone already has shows them instead: use them, or change the phone);
// for cash the buyer's name, phone and addresses, kept on the sale only
export function CustomerCard() {
  const { t, kind, isAdmin, customer, setCustomer, newParty, setNewParty, editingCustomer, setEditingCustomer, matched, tried, setTried, orderLocked, orderBuyer, walkIn } = useSaleEntry();
  const tc = useTranslations("transactions.chat");
  const tpf = useTranslations("transactions.payment.form");
  const picked = customer?.kind === "ledger" ? customer.ledger : null;
  // cash under ₹50,000: only the buyer's address, no search
  if (walkIn) return <CashBuyer />;
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
        // a dispatch on an order goes to who it's for: its customer, or (kept by name) the one of ours with its phone
        locked={(orderLocked || orderBuyer) && customer?.kind === "ledger"}
        onEdit={isAdmin && picked?.party ? () => setEditingCustomer((on) => !on) : undefined}
        placeholder={tc("hints.from")}
      />

      {/* the picked one's details, changed right here */}
      {editingCustomer && picked?.party && (
        <PartyEditor rows ledger={picked} setLedger={(ledger) => setCustomer({ kind: "ledger", ledger })} close={() => setEditingCustomer(false)} />
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
            // the phone on top (one of ours with it shows them instead), then the name and short name; no email
            phoneFirst
            asksEmail={false}
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

// for cash: the buyer's full name and phone side by side (one under the other on a phone), asked and needed only from
// ₹50,000 taxable value (below it, just the address), while an order's buyer has the order's name and phone shown
// (never typed, and not added as a party) whatever the amount; then their address (our place of business, until changed), used
// for billing and shipping. "Ship to a different address" adds a second box for where it goes, which can be removed
// and can't be the same place as the first
function CashBuyer() {
  const { t, buyerName, setBuyerName, buyerPhone, setBuyerPhone, phoneOk, buyerNeeded, addresses, setAddresses, sameAddress, tried, setTried, orderBuyer, order } = useSaleEntry();
  // an order's buyer with a phone on the order: shown, not typed (an older order without one asks it)
  const fixedPhone = orderBuyer && !!order?.customer.phone;
  const tf = useTranslations("accounts.party.form");
  const nameBad = tried && buyerNeeded && buyerName.trim() === "";
  const phoneBad = /^[0-5]/.test(buyerPhone) || (tried && (!phoneOk || (buyerNeeded && buyerPhone === "")));
  const setAddress = (key: string, patch: Partial<(typeof addresses)[number]>) => setAddresses((all) => all.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  const ships = addresses.length > 1;
  return (
    <div className="flex flex-col gap-6">
      {/* personal details, under their heading: when the sale needs them, or an order's buyer (shown as on the order) */}
      {(buyerNeeded || orderBuyer) && (
      <section className="flex flex-col gap-3">
        <h3 className={SECTION_TITLE}>{tf("personal")}</h3>
        <div className="grid grid-cols-1 items-start gap-x-6 gap-y-3 sm:grid-cols-2">
          <label className={fieldRow}>
            <span>
              {tf("name")}
              {buyerNeeded && !orderBuyer && <RequiredMark />}
            </span>
            {orderBuyer ? (
              // an order's buyer: the name is the order's, only shown
              <span className="flex min-h-11 items-center break-words text-base font-semibold">{buyerName}</span>
            ) : (
              <input
                value={buyerName}
                maxLength={150}
                onChange={(e) => setBuyerName(noDigits(e.target.value))}
                aria-invalid={nameBad || undefined}
                className={cn(fieldClass(nameBad), "min-h-11 min-w-0 px-3 text-base")}
              />
            )}
          </label>
          <label className={fieldRow}>
            <span>
              {t("phone")}
              {buyerNeeded && !fixedPhone && <RequiredMark />}
            </span>
            {fixedPhone ? (
              // an order's buyer: the phone is the order's, only shown
              <span className="tabular flex min-h-11 items-center text-base font-semibold">+91 {buyerPhone}</span>
            ) : (
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
            )}
            {!fixedPhone && phoneBad && <FieldMessage className="mt-0">{t("phoneBad")}</FieldMessage>}
          </label>
        </div>
      </section>
      )}

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
            {i === 1 && sameAddress && <FieldMessage className="mt-0">{t("sameAddress")}</FieldMessage>}
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

"use client";

import { useTranslations } from "next-intl";

import { fieldClass } from "~/components/ui/card-form";
import { RequiredMark } from "~/components/ui/required-mark";
import { noDigits } from "~/lib/format";
import { cn } from "~/lib/utils";

import { AddressFields, emptyAddress, emptyDraft, FieldRows, PartyFields, SECTION_TITLE } from "../../../account/party/party-fields";
import { LedgerSearch } from "../../pickers/ledger-picker";
import { fieldRow } from "../../shared/form-basics";
import { PartyPick } from "../../pickers/party-finder";
import { chip } from "../../payment/shared";
import { PickedCard } from "../../shared/picked-card";
import { useOrderEntry } from "./state";

// the supplier, as a payment picks one: a search over the suppliers, picking one moves on; + New party asks their
// details right here, as in a payment, as rows (label left, box right; two columns on a wider screen): the phone
// optional (asked when the order is shared if left out), no email or short name, and one address
export function SupplierCard() {
  const { kind, supplierPick, setSupplierPick, newSupplier, setNewSupplier, supplierMatch, tried, setTried, show } = useOrderEntry();
  const tc = useTranslations("transactions.chat");
  const tp = useTranslations("transactions.payment.form");
  const tpick = useTranslations("transactions.picker");
  // a sale's party step is its customer
  if (kind === "sale") return <CustomerCard />;
  return (
    <div className="flex flex-col gap-4">
      <LedgerSearch
        purpose="payment"
        receiptKind={null}
        paymentKind="supplier"
        value={supplierPick}
        onChange={(c) => {
          setSupplierPick(c);
          if (c?.kind === "party") setNewSupplier(emptyDraft());
          // one picked from the list moves on by itself; a new one waits for their details
          if (c?.kind === "ledger") show("details");
        }}
        canAdd
        addParty
        placeholder={tc("hints.from")}
      />

      {/* someone new: Change goes back to the search, to pick one already added */}
      {supplierPick?.kind === "party" && (
        <PickedCard oneLine onChange={() => setSupplierPick(null)}>
          <span className="min-w-0 flex-1 truncate font-semibold">{tpick("newParty")}</span>
        </PickedCard>
      )}

      {supplierPick?.kind === "party" && (
        <>
        <PartyFields
          draft={newSupplier}
          onChange={(patch) => setNewSupplier((d) => ({ ...d, ...patch }))}
          tried={tried}
          strict
          asksRemarks={false}
          asksPan={false}
          asksShortName={false}
          asksEmail={false}
          oneAddress
          phoneOptional
          rows
          onAddressesOpen={() => setTried(false)}
          onlyPhone={!!supplierMatch}
        />
        {/* a phone someone already has: them instead (use them, or change the phone), as in a payment */}
        {supplierMatch?.party && (
          <div className="flex flex-col gap-3 rounded-control border border-chestnut/40 bg-chestnut/4 p-3">
            <span className="text-xs font-semibold">{tc("q.phoneMatch")}</span>
            <PartyPick ledger={supplierMatch} party={supplierMatch.party} />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setSupplierPick({ kind: "ledger", ledger: supplierMatch });
                  show("details");
                }}
                className={chip(true)}
              >
                {tp("useThem")}
              </button>
              <button type="button" onClick={() => setNewSupplier((d) => ({ ...d, phone: "" }))} className={chip(false)}>
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

// a sale's customer: a search over the customers, picking one moves on; + New party asks a name and an optional phone
// (side by side on a wider screen), then where to deliver once the name is in (the address as a payment asks it), all
// as rows and kept on the order. They become a customer, with a ledger, only if the sale turns out to be on credit
function CustomerCard() {
  const { t, supplierPick, setSupplierPick, newCustomer, setNewCustomer, customerMatch, tried, show } = useOrderEntry();
  const tp = useTranslations("transactions.payment.form");
  const tc = useTranslations("transactions.chat");
  const tf = useTranslations("accounts.party.form");
  const tpick = useTranslations("transactions.picker");
  const nameBad = tried && newCustomer.name.trim() === "";
  const phoneBad = /^[0-5]/.test(newCustomer.phone) || (tried && newCustomer.phone !== "" && newCustomer.phone.length < 10);
  return (
    <div className="flex flex-col gap-4">
      <LedgerSearch
        purpose="receipt"
        receiptKind="customer"
        value={supplierPick}
        onChange={(c) => {
          setSupplierPick(c);
          if (c?.kind === "party") setNewCustomer({ name: "", phone: "", address: emptyAddress(true) });
          // one picked from the list moves on by itself; a new one waits for their name
          if (c?.kind === "ledger") show("details");
        }}
        canAdd
        addParty
        placeholder={tc("hints.from")}
      />

      {/* someone new: Change goes back to the search, to pick one already added */}
      {supplierPick?.kind === "party" && (
        <PickedCard oneLine onChange={() => setSupplierPick(null)}>
          <span className="min-w-0 flex-1 truncate font-semibold">{tpick("newParty")}</span>
        </PickedCard>
      )}

      {/* personal details, under their heading, as a payment's party form */}
      {supplierPick?.kind === "party" && (
        <section className="flex flex-col gap-3">
        <h3 className={SECTION_TITLE}>{tf("personal")}</h3>
        <div className="grid grid-cols-1 items-start gap-x-6 gap-y-3 sm:grid-cols-2">
          <label className={fieldRow}>
            <span>
              {t("customer.name")}
              <RequiredMark />
            </span>
            <input
              autoFocus
              value={newCustomer.name}
              maxLength={150}
              onChange={(e) => setNewCustomer((c) => ({ ...c, name: noDigits(e.target.value) }))}
              aria-invalid={nameBad || undefined}
              className={cn(fieldClass(nameBad), "min-h-11 px-3 text-base")}
            />
          </label>
          <label className={fieldRow}>
            <span>{t("customer.phone")}</span>
            <span className={cn("flex min-h-11 items-center gap-2 px-3", fieldClass(phoneBad))}>
              <span className="text-chestnut/70">+91</span>
              <input
                value={newCustomer.phone}
                inputMode="tel"
                aria-invalid={phoneBad || undefined}
                onChange={(e) => setNewCustomer((c) => ({ ...c, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                className="tabular min-w-0 flex-1 bg-transparent text-base outline-none"
              />
            </span>
            {phoneBad && <span className="text-xs text-danger">{t("done.mobileBad")}</span>}
          </label>
        </div>
        </section>
      )}

      {/* a phone one of ours already has: them instead (use them, or change the phone), as in a payment */}
      {customerMatch?.party && (
        <div className="flex flex-col gap-3 rounded-control border border-chestnut/40 bg-chestnut/4 p-3">
          <span className="text-xs font-semibold">{tc("q.phoneMatch")}</span>
          <PartyPick ledger={customerMatch} party={customerMatch.party} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setSupplierPick({ kind: "ledger", ledger: customerMatch });
                show("details");
              }}
              className={chip(true)}
            >
              {tp("useThem")}
            </button>
            <button type="button" onClick={() => setNewCustomer((c) => ({ ...c, phone: "" }))} className={chip(false)}>
              {tc("changePhone")}
            </button>
          </div>
        </div>
      )}

      {/* where to deliver, once the name is in: the town fills in the PIN, district and state, as in a payment */}
      {supplierPick?.kind === "party" && newCustomer.name.trim() !== "" && !customerMatch && (
        <section className="flex flex-col gap-3">
        <h3 className={SECTION_TITLE}>{tf("addresses")}</h3>
        <FieldRows>
          <AddressFields
            single
            required
            address={newCustomer.address}
            index={0}
            count={1}
            tried={tried}
            onChange={(patch) => setNewCustomer((c) => ({ ...c, address: { ...c.address, ...patch } }))}
            onRemove={() => undefined}
            onMakeDefault={() => undefined}
          />
        </FieldRows>
        </section>
      )}
    </div>
  );
}

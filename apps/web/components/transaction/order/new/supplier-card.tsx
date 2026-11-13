"use client";

import { useTranslations } from "next-intl";

import { emptyDraft, PartyFields } from "../../../account/party/party-fields";
import { LedgerSearch } from "../../pickers/ledger-picker";
import { PartyPick } from "../../pickers/party-finder";
import { chip } from "../../payment/shared";
import { useOrderEntry } from "./state";

// the supplier, as a payment picks one: a search over the suppliers, picking one moves on; + New party asks their
// details right here, as in a payment, as rows (label left, box right; two columns on a wider screen): the phone
// optional (asked when the order is shared if left out), no email or short name, and one address
export function SupplierCard() {
  const { supplierPick, setSupplierPick, newSupplier, setNewSupplier, supplierMatch, tried, setTried, show } = useOrderEntry();
  const tc = useTranslations("transactions.chat");
  const tp = useTranslations("transactions.payment.form");
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

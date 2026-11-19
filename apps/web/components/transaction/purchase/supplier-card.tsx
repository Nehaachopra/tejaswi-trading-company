"use client";

import { useTranslations } from "next-intl";

import { FieldMessage } from "~/components/ui/field-message";

import { emptyDraft, PartyFields } from "../../account/party/party-fields";
import { LedgerSearch } from "../pickers/ledger-picker";
import { PartyPick } from "../pickers/party-finder";
import { chip } from "../shared/form-basics";
import { PartyEditor } from "../shared/party-editor";
import { usePurchaseEntry } from "./state";

// the Supplier card, as a purchase order's: a search over the suppliers; picking one with an address moves on (the bill
// is from their default address; one with none says to add it, Edit for the admin). + New party (the admin's) asks
// their details right here as rows: the phone optional, no email, PAN or short name, and one full address (the town
// fills in the rest); a phone one of ours already has shows them instead
export function SupplierCard() {
  const { t, isAdmin, supplier, setSupplier, newSupplier, setNewSupplier, editingSupplier, setEditingSupplier, matched, tried, setTried, show } = usePurchaseEntry();
  const tc = useTranslations("transactions.chat");
  const tp = useTranslations("transactions.payment.form");
  const picked = supplier?.kind === "ledger" ? supplier.ledger : null;
  return (
    <div className="flex flex-col gap-4">
      <LedgerSearch
        purpose="payment"
        receiptKind={null}
        paymentKind="supplier"
        value={supplier}
        onChange={(c) => {
          setSupplier(c);
          setEditingSupplier(false);
          if (c?.kind === "party") setNewSupplier(emptyDraft());
          // one picked from the list with an address moves on by itself; a new one waits for their details
          if (c?.kind === "ledger" && c.ledger.party?.city) show("paid");
        }}
        canAdd={isAdmin}
        addParty
        onEdit={isAdmin && picked?.party ? () => setEditingSupplier((on) => !on) : undefined}
        placeholder={tc("hints.from")}
      />

      {/* the picked one's details, changed right here */}
      {editingSupplier && picked?.party && <PartyEditor rows ledger={picked} setLedger={(ledger) => setSupplier({ kind: "ledger", ledger })} close={() => setEditingSupplier(false)} />}
      {/* one with no address: the bill needs where it's from */}
      {picked?.party && !picked.party.city && !editingSupplier && (
        <FieldMessage tone="warning" className="mt-0">
          {t("noAddress")}
        </FieldMessage>
      )}

      {/* someone new: their details */}
      {supplier?.kind === "party" && (
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
            onlyPhone={!!matched}
          />
          {/* a phone someone already has: them instead (use them, or change the phone), as in a payment */}
          {matched?.party && (
            <div className="flex flex-col gap-3 rounded-control border border-chestnut/40 bg-chestnut/4 p-3">
              <span className="text-xs font-semibold">{tc("q.phoneMatch")}</span>
              <PartyPick ledger={matched} party={matched.party} />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setSupplier({ kind: "ledger", ledger: matched })} className={chip(true)}>
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

"use client";

import { emptyDraft, PartyFields } from "../../account/party/party-fields";
import { PartySearchView } from "../shared/customer-stage";
import { usePurchaseEntry } from "./state";

// a purchase's customer stage (its supplier), on the shared one: a search over the suppliers; picking one with an
// address moves on (the bill is from their default address; one with none says to add it, Edit for the admin). + New
// party (the admin's) asks their details right here: the phone first (needed), then the name and the rest, no email.
// Cash (the admin's): no search, those details straight away, the address in our town until changed
export function CustomerStage() {
  const { t, tc, isAdmin, complete, supplier, setSupplier, newSupplier, setNewSupplier, editingSupplier, setEditingSupplier, matched, tried, setTried, show, orderLocked, cashNew, setCashSearch } = usePurchaseEntry();
  const picked = supplier?.kind === "ledger" ? supplier.ledger : null;
  return (
    <PartySearchView
      // cash (the admin's): no search, only the new supplier's details
      search={cashNew ? null : {
        purpose: "payment",
        receiptKind: null,
        paymentKind: "supplier",
        value: supplier,
        onChange: (c) => {
          setSupplier(c);
          setEditingSupplier(false);
          if (c?.kind === "party") setNewSupplier(emptyDraft());
          // one picked from the list with an address moves on by itself; a new one waits for their details
          if (c?.kind === "ledger" && c.ledger.party?.city) show("paid");
        },
        canAdd: isAdmin,
        // an arrival on a purchase order is from the order's supplier
        locked: orderLocked && supplier?.kind === "ledger",
        onEdit: isAdmin && picked?.party ? () => setEditingSupplier((on) => !on) : undefined,
        placeholder: tc("hints.from"),
      }}
      editor={picked?.party ? { open: editingSupplier, ledger: picked, setLedger: (ledger) => setSupplier({ kind: "ledger", ledger }), close: () => setEditingSupplier(false) } : null}
      // one with no address: the bill needs where it's from
      noAddress={picked?.party && !picked.party.city ? t("noAddress") : null}
      form={
        supplier?.kind === "party" && (
          <PartyFields
            draft={newSupplier}
            onChange={(patch) => setNewSupplier((d) => ({ ...d, ...patch }))}
            tried={tried}
            strict
            asksRemarks={false}
            onAddressesOpen={() => setTried(false)}
            onlyPhone={!!matched}
            rows
            phoneFirst
            asksEmail={false}
          />
        )
      }
      // someone new: "New party" with Change over their details (cash: Change turns to the search)
      newPartyCard={supplier?.kind === "party"}
      onNewChange={() => {
        if (cashNew) setCashSearch(true);
        setSupplier(null);
      }}
      // someone new, back on the stage with their details complete: shown as picked
      newDone={
        supplier?.kind === "party"
          ? {
              complete: complete.supplier,
              face: { name: newSupplier.name, shortName: newSupplier.shortName || null, types: ["supplier"], phone: newSupplier.phone || null, city: newSupplier.addresses[0]?.city || null },
            }
          : null
      }
      match={
        supplier?.kind === "party" && matched
          ? { ledger: matched, onUse: () => setSupplier({ kind: "ledger", ledger: matched }), onChangePhone: () => setNewSupplier((d) => ({ ...d, phone: "" })) }
          : null
      }
    />
  );
}

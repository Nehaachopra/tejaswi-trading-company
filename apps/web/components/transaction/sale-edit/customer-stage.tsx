"use client";

import { PartyFields } from "../../account/party/party-fields";
import { PartySearchView } from "../shared/customer-stage";
import { useSaleEdit, walkInParty } from "./state";

// an edit's customer stage, only for a walk-in sale put on credit, as a credit sale's: a search over the customers, the
// picked one with Edit and Change; + New party asks a new customer's details right here, the sale's name, phone and
// addresses filled in
export function CustomerStage() {
  const { t, tc, sale, complete, customer, setCustomer, newParty, setNewParty, editingCustomer, setEditingCustomer, matched, tried, setTried } =
    useSaleEdit();
  const picked = customer?.kind === "ledger" ? customer.ledger : null;
  return (
    <PartySearchView
      search={{
        purpose: "receipt",
        receiptKind: "customer",
        value: customer,
        onChange: (c) => {
          setCustomer(c);
          setEditingCustomer(false);
          if (c?.kind === "party") setNewParty(walkInParty(sale));
        },
        canAdd: true,
        onEdit: picked?.party ? () => setEditingCustomer((on) => !on) : undefined,
        placeholder: tc("hints.from"),
      }}
      editor={picked?.party ? { open: editingCustomer, ledger: picked, setLedger: (ledger) => setCustomer({ kind: "ledger", ledger }), close: () => setEditingCustomer(false) } : null}
      // one with no address: the goods need somewhere to go
      noAddress={picked?.party && !picked.party.city ? t("noAddress") : null}
      form={
        customer?.kind === "party" && (
          <PartyFields
            draft={newParty}
            onChange={(patch) => setNewParty((d) => ({ ...d, ...patch }))}
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
      newPartyCard={customer?.kind === "party"}
      onNewChange={() => setCustomer(null)}
      // someone new, back on the stage with their details complete: shown as picked
      newDone={
        customer?.kind === "party"
          ? {
              complete: complete.customer,
              face: { name: newParty.name, shortName: newParty.shortName || null, types: ["customer"], phone: newParty.phone || null, city: newParty.addresses[0]?.city || null },
            }
          : null
      }
      match={
        customer?.kind === "party" && matched
          ? { ledger: matched, onUse: () => setCustomer({ kind: "ledger", ledger: matched }), onChangePhone: () => setNewParty((d) => ({ ...d, phone: "" })) }
          : null
      }
    />
  );
}

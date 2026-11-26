"use client";

import { useTranslations } from "next-intl";

import { PartyFields } from "../../account/party/party-fields";
import { PartyPick } from "../pickers/party-finder";
import { PartySearchView } from "../shared/customer-stage";
import { PartyEditor } from "../shared/party-editor";
import { PickedCard } from "../shared/picked-card";
import { buyerParty, useReturnEntry } from "./state";

// the refund's customer. The sale's own: shown as picked with Edit only (their details changed right here; never
// another customer). A walk-in's refund on credit: who it goes to, as a credit sale's customer stage: a search over
// the customers, the picked one with Edit and Change; + New party asks a new customer's details right here, the
// sale's name and phone filled in
export function CustomerStage() {
  const { customerLedger } = useReturnEntry();
  return customerLedger?.party ? <SaleCustomer /> : <PickCustomer />;
}

// the sale's customer: who they are, with Edit
function SaleCustomer() {
  const { customerLedger, setCustomerLedger, editingCustomer, setEditingCustomer } = useReturnEntry();
  const ledger = customerLedger!;
  return (
    <div className="flex flex-col gap-4">
      <PickedCard onEdit={() => setEditingCustomer((on) => !on)}>
        <PartyPick ledger={ledger} party={ledger.party!} />
      </PickedCard>
      {editingCustomer && <PartyEditor rows ledger={ledger} setLedger={setCustomerLedger} close={() => setEditingCustomer(false)} />}
    </div>
  );
}

// a walk-in's refund on credit: a customer searched for, or added now
function PickCustomer() {
  const { tc, sale, complete, pickedChoice, setPickedChoice, newParty, setNewParty, editingCustomer, setEditingCustomer, matched, tried, setTried } =
    useReturnEntry();
  const ts = useTranslations("transactions.sale");
  const picked = pickedChoice?.kind === "ledger" ? pickedChoice.ledger : null;
  return (
    <PartySearchView
      search={{
        purpose: "receipt",
        receiptKind: "customer",
        value: pickedChoice,
        onChange: (c) => {
          setPickedChoice(c);
          setEditingCustomer(false);
          if (c?.kind === "party") setNewParty(buyerParty(sale));
        },
        canAdd: true,
        onEdit: picked?.party ? () => setEditingCustomer((on) => !on) : undefined,
        placeholder: tc("hints.from"),
      }}
      editor={
        picked?.party
          ? { open: editingCustomer, ledger: picked, setLedger: (ledger) => setPickedChoice({ kind: "ledger", ledger }), close: () => setEditingCustomer(false) }
          : null
      }
      form={
        pickedChoice?.kind === "party" && (
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
      newPartyCard={pickedChoice?.kind === "party"}
      onNewChange={() => setPickedChoice(null)}
      // someone new, back on the stage with their details complete: shown as picked
      newDone={
        pickedChoice?.kind === "party"
          ? {
              complete: complete.customer,
              face: { name: newParty.name, shortName: newParty.shortName || null, types: ["customer"], phone: newParty.phone || null, city: newParty.addresses[0]?.city || null },
            }
          : null
      }
      match={
        pickedChoice?.kind === "party" && matched
          ? { ledger: matched, onUse: () => setPickedChoice({ kind: "ledger", ledger: matched }), onChangePhone: () => setNewParty((d) => ({ ...d, phone: "" })) }
          : null
      }
      noAddress={picked?.party && !picked.party.city ? ts("noAddress") : null}
    />
  );
}

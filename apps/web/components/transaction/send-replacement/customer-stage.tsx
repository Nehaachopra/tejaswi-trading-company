"use client";

import { PartyPick } from "../pickers/party-finder";
import { PartyEditor } from "../shared/party-editor";
import { PickedCard } from "../shared/picked-card";
import { useSendEntry } from "./state";

// the Customer stage: the sale's customer the packs go to, shown as picked with Edit only (their details changed right
// here; never another customer)
export function CustomerStage() {
  const { pending, customerLedger, setCustomerLedger, editingCustomer, setEditingCustomer } = useSendEntry();
  // their ledger not found: just the name
  if (!customerLedger?.party) return <p className="font-semibold">{pending.customerName}</p>;
  return (
    <div className="flex flex-col gap-4">
      <PickedCard onEdit={() => setEditingCustomer((on) => !on)}>
        <PartyPick ledger={customerLedger} party={customerLedger.party} />
      </PickedCard>
      {editingCustomer && <PartyEditor rows ledger={customerLedger} setLedger={setCustomerLedger} close={() => setEditingCustomer(false)} />}
    </div>
  );
}

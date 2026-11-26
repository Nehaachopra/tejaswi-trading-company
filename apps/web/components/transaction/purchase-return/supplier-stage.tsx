"use client";

import { PartyPick } from "../pickers/party-finder";
import { PartyEditor } from "../shared/party-editor";
import { PickedCard } from "../shared/picked-card";
import { useReturnEntry } from "./state";

// the purchase's supplier, as a sale return's customer: who they are, with Edit only (their details changed right
// here; never another supplier)
export function SupplierStage() {
  const { supplierLedger, setSupplierLedger, editingSupplier, setEditingSupplier } = useReturnEntry();
  if (!supplierLedger?.party) return null;
  return (
    <div className="flex flex-col gap-4">
      <PickedCard onEdit={() => setEditingSupplier((on) => !on)}>
        <PartyPick ledger={supplierLedger} party={supplierLedger.party} />
      </PickedCard>
      {editingSupplier && <PartyEditor rows ledger={supplierLedger} setLedger={setSupplierLedger} close={() => setEditingSupplier(false)} />}
    </div>
  );
}

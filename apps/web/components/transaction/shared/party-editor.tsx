"use client";

import { PartyEdit } from "../../account/party/party-sheet";
import { type Pickable } from "../pickers/ledger-picker";

// a picked party's details changed right here; the saved name, phone and town then show on what's picked. Their type
// isn't asked here (salary asks it, since an employee's pay sits under it)
export function PartyEditor({
  ledger,
  setLedger,
  close,
  asksTypes = false,
  rows = false,
}: {
  ledger: Pickable;
  setLedger: (ledger: Pickable) => void;
  close: () => void;
  asksTypes?: boolean;
  // label left, box or dropdown right, as a payment's new supplier
  rows?: boolean;
}) {
  return (
    <PartyEdit
      partyId={ledger.referenceId!}
      asksTypes={asksTypes}
      rows={rows}
      // as rows (a transaction's stage): laid out as its new party is
      newPartyLook={rows}
      onCancel={close}
      onSaved={(saved) => {
        close();
        const home = saved.addresses.find((a) => a.isDefault) ?? saved.addresses[0];
        setLedger({
          ...ledger,
          party: {
            ...ledger.party!,
            name: saved.name,
            shortName: saved.shortName,
            phone: saved.phone,
            city: home?.city ?? null,
            upiIds: saved.upiIds,
            hasPan: !!saved.pan,
          },
        });
      }}
    />
  );
}

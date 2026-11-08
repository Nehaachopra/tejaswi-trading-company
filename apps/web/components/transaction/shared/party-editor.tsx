"use client";

import { PartyEdit } from "../../account/party/party-sheet";
import { type Pickable } from "../pickers/ledger-picker";

// a picked party's details changed right here; the saved name, phone and town then show on what's picked
export function PartyEditor({
  ledger,
  setLedger,
  close,
}: {
  ledger: Pickable;
  setLedger: (ledger: Pickable) => void;
  close: () => void;
}) {
  return (
    <PartyEdit
      partyId={ledger.referenceId!}
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
          },
        });
      }}
    />
  );
}

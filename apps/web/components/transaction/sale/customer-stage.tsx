"use client";

import { emptyDraft, PartyFields } from "../../account/party/party-fields";
import { AddressOnlyView, PartySearchView, PersonalRows } from "../shared/customer-stage";
import { useSaleEntry } from "./state";

// a sale's customer stage, on the shared one: a search over the customers, the picked one with Edit and Change (the
// admin edits their details right here). + New party asks the details right here: on credit a new customer's, as a
// payment adds someone (the admin's); for cash the buyer's name, phone and addresses, kept on the sale only. Cash under
// ₹50,000: only the buyer's address, no search
export function CustomerStage() {
  const { t, tc, kind, isAdmin, complete, buyerName, buyerPhone, addresses, findSaved, customer, setCustomer, newParty, setNewParty, editingCustomer, setEditingCustomer, matched, tried, setTried, orderLocked, orderBuyer, walkIn } =
    useSaleEntry();
  const picked = customer?.kind === "ledger" ? customer.ledger : null;
  // (Change: find a saved customer instead)
  if (walkIn) return <CashBuyer onChange={findSaved} />;
  return (
    <PartySearchView
      search={{
        purpose: "receipt",
        receiptKind: "customer",
        value: customer,
        onChange: (c) => {
          setCustomer(c);
          setEditingCustomer(false);
          // (an edited walk-in sale: the sale's name, phone and addresses again)
          if (c?.kind === "party") setNewParty(emptyDraft());
        },
        // a cash buyer is only kept on the sale, so anyone may type one; a new customer on credit is the admin's
        canAdd: isAdmin || kind === "cash",
        // a dispatch on an order goes to who it's for: its customer, or (kept by name) the one of ours with its phone
        locked: (orderLocked || orderBuyer) && customer?.kind === "ledger",
        onEdit: isAdmin && picked?.party ? () => setEditingCustomer((on) => !on) : undefined,
        placeholder: tc("hints.from"),
      }}
      editor={picked?.party ? { open: editingCustomer, ledger: picked, setLedger: (ledger) => setCustomer({ kind: "ledger", ledger }), close: () => setEditingCustomer(false) } : null}
      // one with no address: the goods need somewhere to go
      noAddress={picked?.party && !picked.party.city ? t("noAddress") : null}
      form={
        customer?.kind === "party" &&
        (kind === "cash" ? (
          // someone new, for cash: the buyer's details
          <CashBuyer />
        ) : (
          // someone new, on credit: a new customer's details
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
        ))
      }
      // someone new: "New party" with Change over their details (none for an order's buyer: the order's)
      newPartyCard={customer?.kind === "party"}
      onNewChange={orderBuyer ? null : () => setCustomer(null)}
      // someone new, back on the stage with their details complete: shown as picked
      newDone={
        customer?.kind === "party"
          ? kind === "cash"
            ? { complete: complete.customer, face: { name: buyerName, shortName: null, types: ["customer"], phone: buyerPhone || null, city: addresses[0]?.city || null } }
            : {
                complete: complete.customer,
                face: { name: newParty.name, shortName: newParty.shortName || null, types: ["customer"], phone: newParty.phone || null, city: newParty.addresses[0]?.city || null },
              }
          : null
      }
      match={
        customer?.kind === "party" && kind === "credit" && matched
          ? { ledger: matched, onUse: () => setCustomer({ kind: "ledger", ledger: matched }), onChangePhone: () => setNewParty((d) => ({ ...d, phone: "" })) }
          : null
      }
    />
  );
}

// for cash: the buyer's name and phone, asked and needed only from ₹50,000 taxable value, while an order's buyer has
// the order's name and phone shown (never typed); then their address (our place of business, until changed)
function CashBuyer({ onChange }: { onChange?: () => void }) {
  const { t, complete, buyerName, setBuyerName, buyerPhone, setBuyerPhone, phoneOk, buyerNeeded, addresses, setAddresses, tried, setTried, orderBuyer, order } = useSaleEntry();
  // an order's buyer with a phone on the order: shown, not typed (an older order without one asks it)
  const fixedPhone = orderBuyer && !!order?.customer.phone;
  return (
    <AddressOnlyView
      personal={
        (buyerNeeded || orderBuyer) && (
          <PersonalRows
            name={buyerName}
            setName={setBuyerName}
            phone={buyerPhone}
            setPhone={setBuyerPhone}
            nameFixed={orderBuyer}
            phoneFixed={fixedPhone}
            nameRequired={buyerNeeded}
            phoneRequired={buyerNeeded}
            nameBad={tried && buyerNeeded && buyerName.trim() === ""}
            phoneBad={/^[0-5]/.test(buyerPhone) || (tried && (!phoneOk || (buyerNeeded && buyerPhone === "")))}
            phoneBadText={t("phoneBad")}
            phoneLabel={t("phone")}
          />
        )
      }
      addresses={addresses}
      setAddresses={setAddresses}
      tried={tried}
      setTried={setTried}
      // only on its own (a walk-in): under the search, the party card shows them once complete
      complete={!!onChange && complete.customer}
      onChange={onChange}
    />
  );
}

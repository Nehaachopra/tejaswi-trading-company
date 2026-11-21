"use client";

import { useTranslations } from "next-intl";

import { emptyAddress, emptyDraft } from "../../../account/party/party-fields";
import { OrderPartyForm, PartySearchView } from "../../shared/customer-stage";
import { useOrderEntry } from "./state";

// an order's customer stage, on the shared one: a search over a purchase order's suppliers or a sale order's
// customers (the one picked shows with Change; Next moves on); + New party asks the same form on both: the name
// (needed), the phone (optional), then one address. A sale order keeps someone new on the order (a customer only if
// the sale turns out to be on credit); a purchase order adds them as a supplier
export function CustomerStage() {
  const { kind, supplierPick, setSupplierPick, newSupplier, setNewSupplier, newCustomer, setNewCustomer, supplierMatch, customerMatch, tried } = useOrderEntry();
  const tc = useTranslations("transactions.chat");
  const sale = kind === "sale";
  const isNew = supplierPick?.kind === "party";
  const matched = sale ? customerMatch : supplierMatch;
  return (
    <PartySearchView
      search={{
        purpose: sale ? "receipt" : "payment",
        receiptKind: sale ? "customer" : null,
        paymentKind: sale ? null : "supplier",
        value: supplierPick,
        onChange: (c) => {
          setSupplierPick(c);
          if (c?.kind === "party") {
            if (sale) setNewCustomer({ name: "", phone: "", address: emptyAddress(true) });
            else setNewSupplier(emptyDraft());
          }
        },
        canAdd: true,
        placeholder: tc("hints.from"),
      }}
      newPartyCard={isNew}
      form={
        isNew &&
        (sale ? (
          <OrderPartyForm
            name={newCustomer.name}
            setName={(name) => setNewCustomer((c) => ({ ...c, name }))}
            phone={newCustomer.phone}
            setPhone={(phone) => setNewCustomer((c) => ({ ...c, phone }))}
            address={newCustomer.address}
            setAddress={(patch) => setNewCustomer((c) => ({ ...c, address: { ...c.address, ...patch } }))}
            tried={tried}
            match={matched ? { ledger: matched, onUse: () => setSupplierPick({ kind: "ledger", ledger: matched }), onChangePhone: () => setNewCustomer((c) => ({ ...c, phone: "" })) } : null}
          />
        ) : (
          <OrderPartyForm
            name={newSupplier.name}
            setName={(name) => setNewSupplier((d) => ({ ...d, name }))}
            phone={newSupplier.phone}
            setPhone={(phone) => setNewSupplier((d) => ({ ...d, phone }))}
            address={newSupplier.addresses[0]!}
            setAddress={(patch) => setNewSupplier((d) => ({ ...d, addresses: d.addresses.map((a, i) => (i === 0 ? { ...a, ...patch } : a)) }))}
            tried={tried}
            match={matched ? { ledger: matched, onUse: () => setSupplierPick({ kind: "ledger", ledger: matched }), onChangePhone: () => setNewSupplier((d) => ({ ...d, phone: "" })) } : null}
          />
        ))
      }
    />
  );
}

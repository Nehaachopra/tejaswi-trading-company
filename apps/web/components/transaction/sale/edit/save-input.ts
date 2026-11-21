import type { RouterInputs } from "@repo/trpc/client";
import type { SaleForEdit } from "~/providers/sale-edit";

import { draftInput as partyInput, type PartyDraft } from "../../../account/party/party-fields";
import type { LedgerChoice } from "../../pickers/ledger-picker";

type CreateSaleIn = RouterInputs["transactions"]["sale"]["create"];
type EditSaleIn = RouterInputs["transactions"]["sale"]["edit"];

// what a new sale and an edit both send: the day, remarks, vehicle, items, charges, discount and cash or credit
export type SaleBase = Pick<
  CreateSaleIn,
  "dateTime" | "remarks" | "vehicleNumber" | "lines" | "discount" | "transportCharges" | "packingCharges" | "loadingCharges" | "kind"
> & { saveKey: string };

// a cash buyer's typed address, as the sale keeps it
type TypedAddress = NonNullable<CreateSaleIn["billToAddress"]>;

// the edit as the server takes it: what moves now (cash only: taken, or refunded), and who it's for. A customer's sale
// keeps its customer and addresses; a walk-in's keeps its typed name, phone and addresses, or (put on credit) becomes
// the customer picked or added now
export function editInput({
  sale,
  base,
  cashAmount,
  bankParts,
  customer,
  newParty,
  buyer,
  billAt,
  shipAt,
}: {
  sale: SaleForEdit;
  base: SaleBase;
  cashAmount: number;
  bankParts: EditSaleIn["bankParts"];
  customer: LedgerChoice;
  newParty: PartyDraft;
  buyer: { name: string; phone: string };
  billAt: TypedAddress;
  shipAt: TypedAddress;
}): EditSaleIn {
  const walkInNow = customer?.kind === "party";
  return {
    ...base,
    transactionId: sale.transactionId,
    cashAmount: base.kind === "cash" ? cashAmount : 0,
    bankParts: base.kind === "cash" ? bankParts : [],
    customerLedgerId: !sale.customer && customer?.kind === "ledger" ? customer.ledger.id : null,
    newCustomer: !sale.customer && base.kind === "credit" && walkInNow ? partyInput(newParty) : null,
    ...(sale.customer
      ? {
          billToAddressId: sale.billTo && "addressId" in sale.billTo ? sale.billTo.addressId : null,
          shipTo: sale.shipTo,
        }
      : walkInNow && base.kind === "cash"
        ? { buyer, shipTo: { address: shipAt }, billToAddress: billAt }
        : {}),
  };
}

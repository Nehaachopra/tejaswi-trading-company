import type { SaleForEdit } from "~/providers/sale-edit";

import { type AddressDraft, emptyAddress } from "../../../account/party/party-fields";
import type { StateCode } from "../../../account/party/party-kinds";
import { indiaDay } from "../../../account/balance";
import type { Pack, ProductGroup } from "../../../product/products/product-tile";
import type { LedgerChoice, Pickable } from "../../pickers/ledger-picker";
import type { CartLine } from "../state";

const round2 = (n: number) => Math.round(n * 100) / 100;

// what the sale form starts from when it edits a sale: the answers as the sale was saved
export type SaleEditSeed = {
  lines: CartLine[];
  discount: string;
  transport: string;
  packing: string;
  loadingCharges: string;
  kind: "cash" | "credit";
  day: string;
  vehicle: string;
  remarks: string;
  customer: LedgerChoice;
  buyerName: string;
  buyerPhone: string;
  // a walk-in's typed addresses (null: none kept, the form's own start stays)
  addresses: AddressDraft[] | null;
};

// the saved sale as the form's answers: its items (each at the price it sold at, with GST; "" when that's the pack's
// saved price), charges and discount, cash or credit, its customer (or a walk-in's name, phone and addresses), the day,
// vehicle and remarks
export function seedOf(sale: SaleForEdit, ledger: Pickable | null, products: ProductGroup[]): SaleEditSeed {
  const packAt = new Map<string, Pack>();
  for (const g of products) for (const p of g.packs) packAt.set(p.productId, p);
  const lines: CartLine[] = sale.lines.map((l) => {
    const pack = packAt.get(l.productId);
    const withGst = round2(l.rateBeforeGst * (1 + (pack?.gstPercent ?? 0) / 100));
    return {
      productId: l.productId,
      newPrice: pack && withGst === pack.priceAfterGst ? "" : String(withGst),
      quantity: String(l.quantity),
      godowns: Object.fromEntries(l.godowns.map((g) => [g.godownId, String(g.quantity)])),
      belowCostOk: true,
    };
  });
  const text = (n: number) => (n > 0 ? String(n) : "");
  const common = {
    lines,
    discount: text(sale.discount),
    transport: text(sale.transportCharges),
    packing: text(sale.packingCharges),
    loadingCharges: text(sale.loadingCharges),
    kind: sale.kind,
    day: indiaDay(new Date(sale.dateTime)),
    vehicle: sale.vehicleNumber ?? "",
    remarks: sale.remarks ?? "",
  };
  // a customer's sale: picked, and kept
  if (sale.customer && ledger)
    return { ...common, customer: { kind: "ledger", ledger }, buyerName: "", buyerPhone: "", addresses: null };

  // a walk-in: billed at the first address, sent to the second when it went elsewhere
  const ship = "address" in sale.shipTo ? draft(sale.shipTo.address) : null;
  const bill = sale.billTo && "address" in sale.billTo ? draft(sale.billTo.address) : null;
  const first = bill ?? ship;
  // (compared without each draft's own key)
  const same = (a: AddressDraft, b: AddressDraft) => JSON.stringify({ ...a, key: "" }) === JSON.stringify({ ...b, key: "" });
  const second = bill && ship && !same(bill, ship) ? { ...ship, isDefault: false } : null;
  const both = [first, second].filter((a): a is AddressDraft => a !== null);
  return {
    ...common,
    customer: { kind: "party" },
    buyerName: sale.buyer?.name ?? "",
    buyerPhone: sale.buyer?.phone ?? "",
    addresses: both.length > 0 ? both : null,
  };
}

// a typed address as the form holds it
function draft(a: {
  addressLine1: string;
  landmark: string;
  city: string;
  district: string;
  state: string;
  stateCode: string;
  postalCode: string;
  gstin: string | null;
}): AddressDraft {
  return {
    ...emptyAddress(true),
    addressLine1: a.addressLine1,
    landmark: a.landmark,
    city: a.city,
    district: a.district,
    state: a.state,
    stateCode: a.stateCode as StateCode,
    postalCode: a.postalCode,
    gstin: a.gstin ?? "",
  };
}

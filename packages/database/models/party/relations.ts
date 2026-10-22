import { relations } from "drizzle-orm";

import { partiesTable } from "./party";
import { partyAddressesTable } from "./party-address";
import { godownsTable } from "../godown/godown";
import { purchaseOrdersTable } from "../order/purchase/purchase-order";
import { saleOrdersTable } from "../order/sale/sale-order";
import { purchasesTable } from "../transaction/purchase/purchase";
import { salesTable } from "../transaction/sale/sale";

export const partiesRelations = relations(partiesTable, ({ many }) => ({
  partyAddresses: many(partyAddressesTable),
  godowns: many(godownsTable),
  purchaseOrders: many(purchaseOrdersTable),
  saleOrders: many(saleOrdersTable),
  purchases: many(purchasesTable),
  sales: many(salesTable),
}));

export const partyAddressesRelations = relations(partyAddressesTable, ({ one, many }) => ({
  party: one(partiesTable, {
    fields: [partyAddressesTable.partyId],
    references: [partiesTable.id],
  }),

  billedPurchases: many(purchasesTable),
  billedSales: many(salesTable, { relationName: "sale_bill_to_address" }),
  shippedSales: many(salesTable, { relationName: "sale_ship_to_address" }),
}));

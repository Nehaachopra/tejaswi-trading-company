import { relations } from "drizzle-orm";

import { partiesTable } from "./party";
import { partyAddressesTable } from "./party-address";
import { godownsTable } from "../godown/godown";
import { purchaseOrdersTable } from "../order/purchase/purchase-order";
import { saleOrdersTable } from "../order/sale/sale-order";
import { purchasesTable } from "../transaction/purchase/purchase";
import { salesTable } from "../transaction/sale/sale";
import { paymentsTable } from "../transaction/payment";
import { receiptsTable } from "../transaction/receipt";
import { purchaseOrderProductsTable } from "../order/purchase/purchase-order-product";
import { saleOrderProductsTable } from "../order/sale/sale-order-product";
import { purchaseProductsTable } from "../transaction/purchase/purchase-product";
import { saleProductsTable } from "../transaction/sale/sale-product";

export const partiesRelations = relations(partiesTable, ({ many }) => ({
  partyAddresses: many(partyAddressesTable),
  godowns: many(godownsTable),
  purchaseOrders: many(purchaseOrdersTable),
  saleOrders: many(saleOrdersTable),
  purchases: many(purchasesTable),
  sales: many(salesTable),
  payments: many(paymentsTable),
  receipts: many(receiptsTable),
}));

export const partyAddressesRelations = relations(partyAddressesTable, ({ one, many }) => ({
  party: one(partiesTable, {
    fields: [partyAddressesTable.partyId],
    references: [partiesTable.id],
  }),

  purchaseOrderProducts: many(purchaseOrderProductsTable),
  saleOrderProducts: many(saleOrderProductsTable),
  purchaseProducts: many(purchaseProductsTable),
  saleProducts: many(saleProductsTable),
}));

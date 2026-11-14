// order_edit.ts

import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { usersTable } from "../auth/user";
import { productsTable } from "../product/product";
import { purchaseOrdersTable } from "./purchase/purchase-order";
import { saleOrdersTable } from "./sale/sale-order";

// what one change to an order was about: an item put on or taken off, an item's quantity or rate, who it's with, the
// expected day, the discount or the remarks
export const orderEditFieldEnum = pgEnum("order_edit_field", [
  "item_added",
  "item_removed",
  "quantity",
  "rate",
  "party",
  "expected_delivery",
  "discount",
  "remarks",
]);

// each change made to an order, one row per change: a save's changes share its edit id, who made it and when. On a
// purchase order or a sale order (exactly one); an item's change names its product. The values are as they read
// (a quantity, a rate in rupees, a day, a name), before and after; none for an item put on (before) or taken off (after)
export const orderEditsTable = pgTable(
  "order_edits",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // the save it was part of
    editId: uuid("edit_id").notNull(),

    purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrdersTable.id, { onDelete: "cascade" }),

    saleOrderId: uuid("sale_order_id").references(() => saleOrdersTable.id, { onDelete: "cascade" }),

    editedById: uuid("edited_by_id").references(() => usersTable.id, { onDelete: "set null" }),

    editedByName: varchar("edited_by_name", { length: 255 }).notNull(),

    field: orderEditFieldEnum("field").notNull(),

    productId: uuid("product_id").references(() => productsTable.id, { onDelete: "no action" }),

    fromValue: varchar("from_value", { length: 1000 }),

    toValue: varchar("to_value", { length: 1000 }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("order_edits_purchase_order_id_idx").on(table.purchaseOrderId),
    index("order_edits_sale_order_id_idx").on(table.saleOrderId),
    index("order_edits_edit_id_idx").on(table.editId),

    // on exactly one order
    check("order_edits_one_order", sql`(${table.purchaseOrderId} IS NULL) <> (${table.saleOrderId} IS NULL)`),

    // an item's change names its product; any other doesn't
    check(
      "order_edits_product_for_items",
      sql`(${table.field} IN ('item_added', 'item_removed', 'quantity', 'rate')) = (${table.productId} IS NOT NULL)`,
    ),
  ],
);

export type OrderEditsType = typeof orderEditsTable.$inferSelect;

export type InsertOrderEditsType = typeof orderEditsTable.$inferInsert;

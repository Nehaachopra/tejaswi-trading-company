import { pgTable, uuid, varchar, date, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { timestamps } from "../../../utils/common/column-type";
import { purchaseOrderProductsTable } from "./purchase-order-product";
import { user } from "../../auth";
import { integer } from "drizzle-orm/pg-core";

export const purchaseOrderDeliveriesTable = pgTable(
  "purchase_order_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    orderProductId: uuid("order_product_id")
      .notNull()
      .references(() => purchaseOrderProductsTable.id, {
        onDelete: "restrict",
      }),

    vehicleNumber: varchar("vehicle_number", { length: 15 }),

    quantityDelivered: integer("quantity_delivered").notNull(),

    deliveryDate: date("delivery_date").notNull().defaultNow(),

    orderedById: varchar("ordered_by_id").references(() => user.id, {
      onDelete: "set null",
    }),

    orderedByName: varchar("ordered_by_name", { length: 255 }).notNull(),

    remarks: varchar("remarks", { length: 500 }),

    ...timestamps,
  },
  (table) => [
    index("purchase_order_deliveries_order_product_idx").on(table.orderProductId),

    check("purchase_order_deliveries_quantity_positive", sql`${table.quantityDelivered} > 0`),
  ],
);

export type PurchaseOrderDeliveriesType = typeof purchaseOrderDeliveriesTable.$inferSelect;

export type InsertPurchaseOrderDeliveriesType = typeof purchaseOrderDeliveriesTable.$inferInsert;

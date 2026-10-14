import {
  pgTable,
  uuid,
  varchar,
  date,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { timestamps } from "../../../utils/common/column-type";
import { saleOrderProductsTable } from "./sale-order-product";
import { usersTable } from "../../auth/user";
import { integer } from "drizzle-orm/pg-core";

export const saleOrderDeliveriesTable = pgTable(
  "sale_order_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    orderProductId: uuid("order_product_id")
      .notNull()
      .references(() => saleOrderProductsTable.id, {
        onDelete: "restrict",
      }),

    vehicleNumber: varchar("vehicle_number", { length: 15 }),

    quantityDelivered: integer("quantity_delivered").notNull(),

    deliveryDate: date("delivery_date").notNull().defaultNow(),

    orderedById: uuid("ordered_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),

    orderedByName: varchar("ordered_by_name", {length: 255}).notNull(),

    remarks: varchar("remarks", { length: 500 }),

    ...timestamps,
  },
  (table) => [
    index("sale_order_deliveries_order_product_idx").on(
      table.orderProductId,
    ),

    check(
      "sale_order_deliveries_quantity_positive",
      sql`${table.quantityDelivered} > 0`,
    ),
  ],
);

export type SaleOrderDeliveriesType = typeof saleOrderDeliveriesTable.$inferSelect;

export type InsertSaleOrderDeliveriesType = typeof saleOrderDeliveriesTable.$inferInsert;
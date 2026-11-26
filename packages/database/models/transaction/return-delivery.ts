import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "../../utils/common/column-type";
import { transactionsTable } from "./transaction";

// a return's replaced packs as they arrive (or go out): one row per pack size per delivery. The return (a sale return
// or a purchase return) on one side, the sale or purchase they came or went on on the other; what's still owed is the
// return's replaced quantity less these
export const returnDeliveriesTable = pgTable(
  "return_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    returnTransactionId: uuid("return_transaction_id")
      .notNull()
      .references(() => transactionsTable.id, { onDelete: "restrict" }),

    deliveryTransactionId: uuid("delivery_transaction_id")
      .notNull()
      .references(() => transactionsTable.id, { onDelete: "restrict" }),

    productId: uuid("product_id").notNull(),

    quantity: integer("quantity").notNull(),

    ...timestamps,
  },
  (table) => [
    index("return_deliveries_return_idx").on(table.returnTransactionId),
    index("return_deliveries_delivery_idx").on(table.deliveryTransactionId),
    check("return_deliveries_quantity_positive", sql`${table.quantity} > 0`),
  ],
);

export type ReturnDeliveriesType = typeof returnDeliveriesTable.$inferSelect;

export type InsertReturnDeliveriesType = typeof returnDeliveriesTable.$inferInsert;

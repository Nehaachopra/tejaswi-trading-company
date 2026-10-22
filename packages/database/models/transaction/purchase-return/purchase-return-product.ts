import { pgTable, uuid, varchar, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { money, timestamps} from "../../../utils/common/column-type";
import { purchaseReturnsTable } from "./purchase-return";import { integer } from "drizzle-orm/pg-core";import { purchaseProductsTable } from "../purchase/purchase-product";
import { productGodownsTable } from "../../godown/product-godown";

export const purchaseReturnProductsTable = pgTable(
  "purchase_return_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    returnId: uuid("return_id")
      .notNull()
      .references(() => purchaseReturnsTable.id, {
        onDelete: "restrict",
      }),

    purchaseProductId: uuid("purchase_product_id")
      .notNull()
      .references(() => purchaseProductsTable.id, {
        onDelete: "restrict",
      }),

    // godown the returned goods leave from; one row per godown
    productGodownId: uuid("product_godown_id").references(() => productGodownsTable.id, {
      onDelete: "no action",
    }),

    godownName: varchar("godown_name", { length: 20 }).notNull(),

    quantity: integer("quantity").notNull(),

    grossProductPrice: money("gross_product_price").notNull(),

    discountAmount: money("discount_amount").notNull().default("0.00"),

    gstAmount: money("gst_amount").notNull().default("0.00"),

    ...timestamps,
  },
  (table) => [
    index("purchase_return_products_return_id_idx").on(
      table.returnId,
    ),

    index("purchase_return_products_original_product_idx").on(
      table.purchaseProductId,
    ),

    check(
      "purchase_return_products_quantity_positive",
      sql`${table.quantity} > 0`,
    ),

    check(
      "purchase_return_products_amounts_non_negative",
      sql`${table.grossProductPrice} >= 0
        AND ${table.discountAmount} >= 0
        AND ${table.gstAmount} >= 0`,
    ),

    check(
      "purchase_return_products_discount_within_amount",
      sql`${table.discountAmount} <= ${table.quantity} * ${table.grossProductPrice}`,
    ),
  ],
);

export type PurchaseReturnProductsType = typeof purchaseReturnProductsTable.$inferSelect;

export type InsertPurchaseReturnProductsType = typeof purchaseReturnProductsTable.$inferInsert;
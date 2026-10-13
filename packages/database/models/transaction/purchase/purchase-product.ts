import { sql } from "drizzle-orm";
import {
  integer,
  pgTable,
  uuid,
  varchar,
  text,
  check,
  index,
} from "drizzle-orm/pg-core";

import { money, timestamps } from "../../../utils/common/column-type";import { purchasesTable } from "./purchase";
import {
  gstPlaceOfSupplyEnum,
  supplyTypeEnum,
} from "../../../utils/common/enum";
import { partyAddressesTable } from "../../party/party-address";
import { productGodownsTable } from "../../godown/product-godown";

export const purchaseProductsTable = pgTable(
  "purchase_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchasesTable.id, { onDelete: "restrict" }),

    productGodownId: uuid("product_godown_id").references(() => productGodownsTable.id, {
      onDelete: "set null"
    }),

    godownName: varchar("godown_name", {length: 20}).notNull(),

    partyAddressId: uuid("party_address_id").references(
      () => partyAddressesTable.id,
      { onDelete: "set null" },
    ),

    partyGstinSnapshot: varchar("party_gstin_snapshot", { length: 15 }),

    partyAddressLine1Snapshot: varchar("party_address_line_1_snapshot", {
      length: 200,
    }).notNull(),

    partyAddressLine2Snapshot: varchar("party_address_line_2_snapshot", {
      length: 200,
    }),

    partyCitySnapshot: varchar("party_city_snapshot", {
      length: 100,
    }).notNull(),

    partyDistrictSnapshot: varchar("party_district_snapshot", {
      length: 100,
    }).notNull(),

    partyStateSnapshot: varchar("party_state_snapshot", {
      length: 100,
    }).notNull(),

    partyStateCodeSnapshot: gstPlaceOfSupplyEnum(
      "party_state_code_snapshot",
    ).notNull(),

    partyPostalCodeSnapshot: varchar("party_postal_code_snapshot", {
      length: 10,
    }).notNull(),

    quantity: integer("quantity").notNull().default(0),

    grossProductPrice: money("gross_product_price").notNull(),

    discountAmount: money("discount_amount").notNull().default("0.00"),

    supplyType: supplyTypeEnum("supply_type").notNull(),

    gstRate: integer("gst_rate").notNull(),

    gstAmount: money("gst_amount").notNull().default("0.00"),

    vehicleNumber: varchar("vehicle_number", { length: 15 }),

    remarks: text("remarks"),

    ...timestamps,
  },
  (table) => [
    index("purchase_products_purchase_id_idx").on(table.purchaseId),
    index("purchase_products_product_godown_id_idx").on(table.productGodownId),

    check(
      "purchase_products_quantity_positive",
      sql`${table.quantity} > 0`,
    ),

    check(
      "purchase_products_gross_price_non_negative",
      sql`${table.grossProductPrice} >= 0`,
    ),

    check(
      "purchase_products_discount_within_price",
      sql`${table.discountAmount} <= ${table.grossProductPrice}`,
    ),

    check(
      "purchase_products_gst_amount_non_negative",
      sql`${table.gstAmount} >= 0`,
    ),

    check(
      "purchase_products_gst_rate_valid",
      sql`${table.gstRate} >= 0 AND ${table.gstRate} <= 100`,
    ),
  ],
);

export type PurchaseProductsType = typeof purchaseProductsTable.$inferSelect;

export type InsertPurchaseProductsType = typeof purchaseProductsTable.$inferInsert;
// lender.ts

import { sql } from "drizzle-orm";
import { boolean, check, pgEnum, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { timestamps } from "../../utils/common/column-type";

// who gave a loan we took: a bank or NBFC is a lender of its own here; an individual is a party. It decides the interest's TDS
export const lenderTypeEnum = pgEnum("lender_type", ["bank", "nbfc", "individual"]);

// a bank or NBFC we took a term loan from: added with the loan or in Entities, with its own ledger under Bank loans.
// Never a party: it has no phone, address or short name, and can't be picked as a supplier or customer
export const lendersTable = pgTable(
  "lenders",
  {
    id: uuid("id")
      .primaryKey()
      .defaultRandom(),

    name: varchar("name", { length: 150 })
      .notNull(),

    branch: varchar("branch", { length: 100 }),

    type: lenderTypeEnum("type")
      .notNull(),

    // for an NBFC's TDS on interest
    pan: varchar("pan", { length: 10 }),

    isActive: boolean("is_active")
      .notNull()
      .default(true),

    ...timestamps,
  },
  (table) => [
    // the same lender's other branch is another lender
    uniqueIndex("lenders_name_branch_unique").on(sql`lower(${table.name})`, sql`coalesce(lower(${table.branch}), '')`),

    check("lenders_type_bank_or_nbfc", sql`${table.type} <> 'individual'`),
  ],
);

// user.ts

import { boolean, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";

import { timestamps } from "../../utils/common/column-type";
import { appUserRoleEnum } from "../../utils/common/enum";
import { uniqueIndex } from "drizzle-orm/pg-core";

// only admins register users; login is phone + OTP, so phone is the identity
export const usersTable = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    name: varchar("name", { length: 30 }).notNull(),

    countryCode: varchar("country_code", { length: 5 }).default("+91").notNull(),

    phone: varchar("phone", { length: 20 }).notNull(),

    role: appUserRoleEnum("role").default("staff").notNull(),

    isActive: boolean("is_active").default(true).notNull(),

    photoUrl: text("photo_url"),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_country_code_phone_unique").on(table.countryCode, table.phone),
  ],
);

export type UsersType = typeof usersTable.$inferSelect;

export type InsertUsersType = typeof usersTable.$inferInsert;

import { pgEnum } from "drizzle-orm/pg-core";
import { timestamp, numeric } from "drizzle-orm/pg-core";

export const timestamps = {
  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

export const money = (name: string) =>
  numeric(name, {
    precision: 15,
    scale: 2,
  });

  export const percent = (name: string) => numeric(name, {
    precision: 3,
    scale: 2
  })
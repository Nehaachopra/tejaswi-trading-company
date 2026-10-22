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

// up to 999.99, so GST rates such as 18 or 28 and TDS rates such as 10 fit
export const percent = (name: string) =>
  numeric(name, {
    precision: 5,
    scale: 2,
  });
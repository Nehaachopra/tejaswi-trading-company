import { relations } from "drizzle-orm";

import { usersTable } from "./user";
import { sessionsTable } from "./session";
import { passkeysTable } from "./passkey";

export const usersRelations = relations(usersTable, ({ many }) => ({
  sessions: many(sessionsTable),
  passkeys: many(passkeysTable),
}));

export const sessionsRelations = relations(sessionsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [sessionsTable.userId],
    references: [usersTable.id],
  }),
}));

export const passkeysRelations = relations(passkeysTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [passkeysTable.userId],
    references: [usersTable.id],
  }),
}));

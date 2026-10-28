DROP INDEX "parties_phone_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "parties_phone_unique" ON "parties" USING btree ("phone");
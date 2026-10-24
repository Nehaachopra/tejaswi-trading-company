DROP INDEX "parties_gstin_unique";--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "short_name" varchar(20) NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "parties_short_name_unique" ON "parties" USING btree ("short_name");--> statement-breakpoint
CREATE INDEX "party_addresses_gstin_idx" ON "party_addresses" USING btree ("gstin");
-- landlords become parties of type landlord; party type "both" becomes "customer_supplier". Reordered by hand from the
-- generated file so nothing is lost: old values and landlords are moved before the enum is rebuilt and the table dropped
-- 1. the old phone rule goes first (landlords get their own below), and the type turns to text while values change
DROP INDEX "parties_phone_unique";--> statement-breakpoint
ALTER TABLE "parties" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
UPDATE "parties" SET "type" = 'customer_supplier' WHERE "type" = 'both';--> statement-breakpoint
-- 2. each landlord becomes a party of type landlord, keeping its id (godowns and payments already point to it)
INSERT INTO "parties" ("id", "name", "short_name", "type", "country_code", "phone", "email", "pan", "is_active", "remarks", "created_at", "updated_at")
SELECT "id", "name", "short_name", 'landlord', "country_code", "phone", "email", "pan", "is_active", "remarks", "created_at", "updated_at"
FROM "landlords";--> statement-breakpoint
-- 3. the Rent payable group under Liability, if the app hasn't made it yet
INSERT INTO "ledger_masters" ("name", "ledger_group_id")
SELECT 'Rent payable', g."id" FROM "ledger_groups" g
WHERE g."type" = 'liability'
  AND NOT EXISTS (SELECT 1 FROM "ledger_masters" m WHERE m."name" = 'Rent payable' AND m."ledger_group_id" = g."id");--> statement-breakpoint
-- 4. a ledger per landlord in Rent payable: its short name, or its full name in lowercase; nothing owed yet
INSERT INTO "ledgers" ("name", "ledger_group_id", "ledger_master_id", "reference_table", "reference_id", "balance", "is_active")
SELECT coalesce(l."short_name", lower(trim(l."name"))), m."ledger_group_id", m."id", 'parties', l."id", 0, l."is_active"
FROM "landlords" l
JOIN "ledger_masters" m ON m."name" = 'Rent payable'
JOIN "ledger_groups" g ON g."id" = m."ledger_group_id" AND g."type" = 'liability';--> statement-breakpoint
-- 5. the new type
DROP TYPE "public"."party_type";--> statement-breakpoint
CREATE TYPE "public"."party_type" AS ENUM('customer', 'supplier', 'customer_supplier', 'landlord');--> statement-breakpoint
ALTER TABLE "parties" ALTER COLUMN "type" SET DATA TYPE "public"."party_type" USING "type"::"public"."party_type";--> statement-breakpoint
-- 6. the landlords table goes (its foreign keys from godowns and payments with it), and they point to parties instead
ALTER TABLE "landlords" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "landlords" CASCADE;--> statement-breakpoint
ALTER TABLE "godowns" ADD CONSTRAINT "godowns_landlord_id_parties_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payee_landlord_id_parties_id_fk" FOREIGN KEY ("payee_landlord_id") REFERENCES "public"."parties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- 7. phones: one per party among landlords, and one per party among everyone else
CREATE UNIQUE INDEX "parties_landlord_phone_unique" ON "parties" USING btree ("phone") WHERE "parties"."type" = 'landlord';--> statement-breakpoint
CREATE UNIQUE INDEX "parties_phone_unique" ON "parties" USING btree ("phone") WHERE "parties"."type" IS DISTINCT FROM 'landlord';

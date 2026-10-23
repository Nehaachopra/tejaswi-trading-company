CREATE TYPE "public"."party_type" AS ENUM('customer', 'supplier', 'both');--> statement-breakpoint
ALTER TABLE "ledger_groups" DROP CONSTRAINT "ledger_groups_balance_non_negative";--> statement-breakpoint
ALTER TABLE "ledger_masters" DROP CONSTRAINT "ledger_master_balance_non_negative";--> statement-breakpoint
ALTER TABLE "ledgers" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_details" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "type" "party_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_groups" DROP COLUMN "balance";--> statement-breakpoint
ALTER TABLE "ledger_groups" DROP COLUMN "balance_type";--> statement-breakpoint
ALTER TABLE "ledger_masters" DROP COLUMN "balance";--> statement-breakpoint
ALTER TABLE "ledger_masters" DROP COLUMN "balance_type";
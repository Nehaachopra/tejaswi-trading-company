CREATE TYPE "public"."received_for" AS ENUM('customer', 'loan_received', 'loan_repaid', 'capital', 'refund', 'other_income');--> statement-breakpoint
ALTER TABLE "parties" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."party_type";--> statement-breakpoint
CREATE TYPE "public"."party_type" AS ENUM('customer', 'supplier', 'both');--> statement-breakpoint
ALTER TABLE "parties" ALTER COLUMN "type" SET DATA TYPE "public"."party_type" USING "type"::"public"."party_type";--> statement-breakpoint
ALTER TABLE "parties" ALTER COLUMN "type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "received_for" "received_for" DEFAULT 'customer' NOT NULL;--> statement-breakpoint
CREATE INDEX "parties_phone_idx" ON "parties" USING btree ("phone");
CREATE TYPE "public"."bank_mode" AS ENUM('upi', 'imps', 'neft_rtgs', 'cheque');--> statement-breakpoint
ALTER TABLE "payment_bank_details" ADD COLUMN "mode" "bank_mode" NOT NULL;
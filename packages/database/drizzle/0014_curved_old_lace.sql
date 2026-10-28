CREATE TYPE "public"."paid_for" AS ENUM('supplier', 'loan_repaid', 'loan_given', 'expense', 'tax_paid', 'refund');--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "party_name_snapshot" varchar(150);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "party_short_name_snapshot" varchar(20);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "party_address_line_1_snapshot" varchar(200);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "party_address_line_2_snapshot" varchar(200);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "party_city_snapshot" varchar(100);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "party_postal_code_snapshot" varchar(6);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "party_state_snapshot" varchar(100);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "party_state_code_snapshot" "gst_place_of_supply";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "party_gstin_snapshot" varchar(15);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "paid_for" "paid_for" NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reference_number" varchar(30);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "bank_name_snapshot" varchar(100);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "bank_account_last4_snapshot" varchar(4);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "bank_ifsc_snapshot" varchar(11);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "interest_amount" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_interest_within_amount" CHECK ("payments"."interest_amount" IS NULL OR ("payments"."interest_amount" >= 0 AND "payments"."interest_amount" <= "payments"."amount"));
ALTER TYPE "public"."settled_in" ADD VALUE 'cash_and_bank';--> statement-breakpoint
CREATE TABLE "payment_bank_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"bank_details_id" uuid NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"reference_number" varchar(30),
	"bank_name_snapshot" varchar(100) NOT NULL,
	"bank_account_last4_snapshot" varchar(4) NOT NULL,
	"bank_ifsc_snapshot" varchar(11),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_bank_details_amount_positive" CHECK ("payment_bank_details"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_bank_account_for_bank";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_bank_details_id_bank_details_id_fk";
--> statement-breakpoint
DROP INDEX "payments_bank_details_id_idx";--> statement-breakpoint
ALTER TABLE "payment_bank_details" ADD CONSTRAINT "payment_bank_details_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_bank_details" ADD CONSTRAINT "payment_bank_details_bank_details_id_bank_details_id_fk" FOREIGN KEY ("bank_details_id") REFERENCES "public"."bank_details"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_bank_details_payment_id_unique" ON "payment_bank_details" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_bank_details_bank_details_id_idx" ON "payment_bank_details" USING btree ("bank_details_id");--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "bank_details_id";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "reference_number";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "bank_name_snapshot";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "bank_account_last4_snapshot";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "bank_ifsc_snapshot";
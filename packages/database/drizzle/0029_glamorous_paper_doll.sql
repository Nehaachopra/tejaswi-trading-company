CREATE TABLE "receipt_bank_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"bank_details_id" uuid NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"mode" "bank_mode" NOT NULL,
	"reference_number" varchar(30),
	"bank_name_snapshot" varchar(100) NOT NULL,
	"bank_account_last4_snapshot" varchar(4) NOT NULL,
	"bank_ifsc_snapshot" varchar(11),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipt_bank_details_amount_positive" CHECK ("receipt_bank_details"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "receipts" DROP CONSTRAINT "receipts_bank_account_for_bank";--> statement-breakpoint
ALTER TABLE "receipts" DROP CONSTRAINT "receipts_bank_details_id_bank_details_id_fk";
--> statement-breakpoint
DROP INDEX "receipts_bank_details_id_idx";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reference_number" varchar(30);--> statement-breakpoint
ALTER TABLE "receipt_bank_details" ADD CONSTRAINT "receipt_bank_details_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_bank_details" ADD CONSTRAINT "receipt_bank_details_bank_details_id_bank_details_id_fk" FOREIGN KEY ("bank_details_id") REFERENCES "public"."bank_details"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "receipt_bank_details_receipt_account_unique" ON "receipt_bank_details" USING btree ("receipt_id","bank_details_id");--> statement-breakpoint
CREATE INDEX "receipt_bank_details_receipt_id_idx" ON "receipt_bank_details" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "receipt_bank_details_bank_details_id_idx" ON "receipt_bank_details" USING btree ("bank_details_id");--> statement-breakpoint
ALTER TABLE "receipts" DROP COLUMN "bank_details_id";--> statement-breakpoint
ALTER TABLE "receipts" DROP COLUMN "bank_name_snapshot";--> statement-breakpoint
ALTER TABLE "receipts" DROP COLUMN "bank_account_last4_snapshot";--> statement-breakpoint
ALTER TABLE "receipts" DROP COLUMN "bank_ifsc_snapshot";
CREATE TABLE "transaction_bank_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"bank_details_id" uuid NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"mode" "bank_mode" NOT NULL,
	"reference_number" varchar(30),
	"bank_name_snapshot" varchar(100) NOT NULL,
	"bank_account_last4_snapshot" varchar(4) NOT NULL,
	"bank_ifsc_snapshot" varchar(11),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_bank_details_amount_positive" CHECK ("transaction_bank_details"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "payment_bank_details" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "receipt_bank_details" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "payment_bank_details" CASCADE;--> statement-breakpoint
DROP TABLE "receipt_bank_details" CASCADE;--> statement-breakpoint
ALTER TABLE "salaries" DROP CONSTRAINT "salaries_cash_or_bank";--> statement-breakpoint
ALTER TABLE "salaries" DROP CONSTRAINT "salaries_bank_details_id_bank_details_id_fk";
--> statement-breakpoint
ALTER TABLE "transaction_bank_details" ADD CONSTRAINT "transaction_bank_details_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_bank_details" ADD CONSTRAINT "transaction_bank_details_bank_details_id_bank_details_id_fk" FOREIGN KEY ("bank_details_id") REFERENCES "public"."bank_details"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_bank_details_transaction_account_unique" ON "transaction_bank_details" USING btree ("transaction_id","bank_details_id");--> statement-breakpoint
CREATE INDEX "transaction_bank_details_transaction_id_idx" ON "transaction_bank_details" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transaction_bank_details_bank_details_id_idx" ON "transaction_bank_details" USING btree ("bank_details_id");--> statement-breakpoint
ALTER TABLE "salaries" DROP COLUMN "bank_details_id";
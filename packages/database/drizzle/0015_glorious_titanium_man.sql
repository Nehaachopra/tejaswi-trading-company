CREATE TYPE "public"."due_kind" AS ENUM('debtor', 'creditor', 'loan_given', 'loan_taken');--> statement-breakpoint
ALTER TYPE "public"."paid_for" ADD VALUE 'interest_paid' BEFORE 'loan_given';--> statement-breakpoint
ALTER TYPE "public"."received_for" ADD VALUE 'interest_received' BEFORE 'capital';--> statement-breakpoint
CREATE TABLE "due_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"due_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "due_settlements_amount_positive" CHECK ("due_settlements"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "dues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "due_kind" NOT NULL,
	"party_id" uuid NOT NULL,
	"party_name" varchar(150) NOT NULL,
	"party_phone" varchar(20),
	"transaction_id" uuid NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"due_on" date,
	"interest_rate" numeric(5, 2),
	"frequency" "loan_frequency",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dues_amount_positive" CHECK ("dues"."amount" > 0),
	CONSTRAINT "dues_loan_terms" CHECK (("dues"."kind" IN ('loan_given', 'loan_taken')) = ("dues"."interest_rate" IS NOT NULL AND "dues"."frequency" IS NOT NULL)),
	CONSTRAINT "dues_interest_rate_valid" CHECK ("dues"."interest_rate" IS NULL OR ("dues"."interest_rate" >= 0 AND "dues"."interest_rate" <= 100))
);
--> statement-breakpoint
ALTER TABLE "loans" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "loans" CASCADE;--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_interest_within_amount";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "interest_on_due_id" uuid;--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "interest_on_due_id" uuid;--> statement-breakpoint
ALTER TABLE "due_settlements" ADD CONSTRAINT "due_settlements_due_id_dues_id_fk" FOREIGN KEY ("due_id") REFERENCES "public"."dues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "due_settlements" ADD CONSTRAINT "due_settlements_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dues" ADD CONSTRAINT "dues_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dues" ADD CONSTRAINT "dues_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "due_settlements_due_transaction_unique" ON "due_settlements" USING btree ("due_id","transaction_id");--> statement-breakpoint
CREATE INDEX "due_settlements_transaction_id_idx" ON "due_settlements" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dues_transaction_id_unique" ON "dues" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "dues_party_id_idx" ON "dues" USING btree ("party_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_interest_on_due_id_dues_id_fk" FOREIGN KEY ("interest_on_due_id") REFERENCES "public"."dues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_interest_on_due_id_dues_id_fk" FOREIGN KEY ("interest_on_due_id") REFERENCES "public"."dues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "interest_amount";--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_interest_on_a_loan" CHECK (("payments"."interest_on_due_id" IS NOT NULL) = ("payments"."paid_for"::text = 'interest_paid'));
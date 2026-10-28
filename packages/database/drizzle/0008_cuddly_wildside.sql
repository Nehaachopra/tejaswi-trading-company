CREATE TYPE "public"."loan_frequency" AS ENUM('monthly', 'quarterly', 'half_yearly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."loan_interest_type" AS ENUM('simple', 'reducing');--> statement-breakpoint
CREATE TYPE "public"."loan_repayment" AS ENUM('emi', 'interest_then_lump_sum', 'lump_sum', 'flexible');--> statement-breakpoint
ALTER TYPE "public"."party_type" ADD VALUE 'lender';--> statement-breakpoint
CREATE TABLE "loans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"party_name" varchar(150) NOT NULL,
	"party_phone" varchar(20),
	"transaction_id" uuid NOT NULL,
	"interest_rate" numeric(5, 2),
	"interest_type" "loan_interest_type",
	"repayment" "loan_repayment" NOT NULL,
	"frequency" "loan_frequency",
	"tenure_months" smallint,
	"installment" numeric(15, 2),
	"first_due_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loans_interest_rate_valid" CHECK ("loans"."interest_rate" IS NULL OR ("loans"."interest_rate" >= 0 AND "loans"."interest_rate" <= 100)),
	CONSTRAINT "loans_tenure_valid" CHECK ("loans"."tenure_months" IS NULL OR "loans"."tenure_months" > 0),
	CONSTRAINT "loans_installment_valid" CHECK ("loans"."installment" IS NULL OR "loans"."installment" > 0)
);
--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "loans_transaction_id_unique" ON "loans" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "loans_party_id_idx" ON "loans" USING btree ("party_id");
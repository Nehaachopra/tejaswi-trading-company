CREATE TABLE "lenders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(150) NOT NULL,
	"branch" varchar(100),
	"type" "lender_type" NOT NULL,
	"pan" varchar(10),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lenders_type_bank_or_nbfc" CHECK ("lenders"."type" <> 'individual')
);
--> statement-breakpoint
ALTER TABLE "dues" ALTER COLUMN "party_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dues" ADD COLUMN "lender_id" uuid;--> statement-breakpoint
ALTER TABLE "dues" ADD COLUMN "loan_account_number" varchar(30);--> statement-breakpoint
ALTER TABLE "dues" ADD COLUMN "emi_amount" numeric(15, 2);--> statement-breakpoint
CREATE UNIQUE INDEX "lenders_name_branch_unique" ON "lenders" USING btree (lower("name"),coalesce(lower("branch"), ''));--> statement-breakpoint
ALTER TABLE "dues" ADD CONSTRAINT "dues_lender_id_lenders_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."lenders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dues_lender_id_idx" ON "dues" USING btree ("lender_id");--> statement-breakpoint
ALTER TABLE "dues" ADD CONSTRAINT "dues_party_or_lender" CHECK (("dues"."party_id" IS NULL) <> ("dues"."lender_id" IS NULL));--> statement-breakpoint
ALTER TABLE "dues" ADD CONSTRAINT "dues_lender_account" CHECK (("dues"."lender_id" IS NULL) = ("dues"."loan_account_number" IS NULL));--> statement-breakpoint
ALTER TABLE "dues" ADD CONSTRAINT "dues_emi_on_lender" CHECK ("dues"."emi_amount" IS NULL OR ("dues"."lender_id" IS NOT NULL AND "dues"."emi_amount" > 0));
CREATE TABLE "party_paid_before" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"financial_year" varchar(7) NOT NULL,
	"paid" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"tds" numeric(15, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "party_paid_before_amounts_check" CHECK ("party_paid_before"."paid" >= 0 AND "party_paid_before"."tds" >= 0 AND "party_paid_before"."tds" <= "party_paid_before"."paid")
);
--> statement-breakpoint
ALTER TABLE "party_paid_before" ADD CONSTRAINT "party_paid_before_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "party_paid_before_party_year_unique" ON "party_paid_before" USING btree ("party_id","financial_year");
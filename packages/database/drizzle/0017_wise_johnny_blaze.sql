CREATE TYPE "public"."tds_type" AS ENUM('rent', 'contract', 'brokerage');--> statement-breakpoint
ALTER TABLE "ledgers" ADD COLUMN "tds_type" "tds_type";--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "transport_declaration" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "payee_party_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payee_party_id_parties_id_fk" FOREIGN KEY ("payee_party_id") REFERENCES "public"."parties"("id") ON DELETE restrict ON UPDATE no action;
CREATE TABLE "party_upi_ids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"upi_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "party_upi_ids" ADD CONSTRAINT "party_upi_ids_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "party_upi_ids_party_upi_unique" ON "party_upi_ids" USING btree ("party_id","upi_id");--> statement-breakpoint
CREATE INDEX "party_upi_ids_party_id_idx" ON "party_upi_ids" USING btree ("party_id");
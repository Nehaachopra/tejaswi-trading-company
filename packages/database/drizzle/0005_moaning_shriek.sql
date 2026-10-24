CREATE TYPE "public"."upi_provider" AS ENUM('phonepe', 'gpay', 'paytm', 'bhim', 'amazon_pay', 'other');--> statement-breakpoint
CREATE TABLE "bank_upi_ids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_details_id" uuid NOT NULL,
	"upi_id" varchar(255) NOT NULL,
	"provider" "upi_provider" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_details" ALTER COLUMN "ifsc_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_upi_ids" ADD CONSTRAINT "bank_upi_ids_bank_details_id_bank_details_id_fk" FOREIGN KEY ("bank_details_id") REFERENCES "public"."bank_details"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_upi_ids_upi_id_unique" ON "bank_upi_ids" USING btree ("upi_id");--> statement-breakpoint
CREATE INDEX "bank_upi_ids_bank_details_id_idx" ON "bank_upi_ids" USING btree ("bank_details_id");--> statement-breakpoint
ALTER TABLE "bank_details" DROP COLUMN "upi_id";
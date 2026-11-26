CREATE TYPE "public"."purchase_return_reason" AS ENUM('damaged', 'shortage', 'wrong_item', 'other');--> statement-breakpoint
ALTER TABLE "purchase_returns" ALTER COLUMN "supplier_credit_note_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_returns" ALTER COLUMN "supplier_credit_note_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_returns" ALTER COLUMN "note_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD COLUMN "reason_kind" "purchase_return_reason" NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD COLUMN "exchange_purchase_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_exchange_purchase_id_purchases_id_fk" FOREIGN KEY ("exchange_purchase_id") REFERENCES "public"."purchases"("id") ON DELETE restrict ON UPDATE no action;
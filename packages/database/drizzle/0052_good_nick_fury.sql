ALTER TABLE "purchase_returns" DROP CONSTRAINT "purchase_returns_exchange_purchase_id_purchases_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_return_products" ADD COLUMN "replaced" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_return_products" ADD COLUMN "pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_return_products" ADD COLUMN "received_at" date;--> statement-breakpoint
ALTER TABLE "purchase_returns" DROP COLUMN "exchange_purchase_id";
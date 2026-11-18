ALTER TABLE "product_prices" ALTER COLUMN "price_before_gst" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product_prices" ALTER COLUMN "gst_amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product_prices" ALTER COLUMN "price_after_gst" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product_prices" ADD COLUMN "from_purchase" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_price_set" CHECK ("product_prices"."from_purchase" OR ("product_prices"."price_before_gst" IS NOT NULL AND "product_prices"."gst_amount" IS NOT NULL AND "product_prices"."price_after_gst" IS NOT NULL));
ALTER TABLE "purchase_order_products" RENAME COLUMN "gross_product_price" TO "rate_before_gst";--> statement-breakpoint
ALTER TABLE "purchase_order_products" DROP CONSTRAINT "purchase_order_products_purchase_price_non_negative";--> statement-breakpoint
ALTER TABLE "purchase_order_products" DROP CONSTRAINT "purchase_order_products_discount_amount_valid";--> statement-breakpoint
ALTER TABLE "purchase_order_products" ALTER COLUMN "gst_rate" SET DATA TYPE numeric(5, 2);--> statement-breakpoint
ALTER TABLE "purchase_order_products" ADD CONSTRAINT "purchase_order_products_purchase_price_non_negative" CHECK ("purchase_order_products"."rate_before_gst" >= 0);--> statement-breakpoint
ALTER TABLE "purchase_order_products" ADD CONSTRAINT "purchase_order_products_discount_amount_valid" CHECK ("purchase_order_products"."discount_amount" <= "purchase_order_products"."quantity_ordered" * "purchase_order_products"."rate_before_gst");
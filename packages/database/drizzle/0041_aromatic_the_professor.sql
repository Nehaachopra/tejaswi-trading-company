ALTER TABLE "sale_order_products" RENAME COLUMN "gross_product_price" TO "rate_before_gst";--> statement-breakpoint
ALTER TABLE "sale_order_products" DROP CONSTRAINT "sale_order_products_sale_price_non_negative";--> statement-breakpoint
ALTER TABLE "sale_order_products" DROP CONSTRAINT "sale_order_products_discount_amount_valid";--> statement-breakpoint
ALTER TABLE "sale_orders" ALTER COLUMN "party_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_order_products" ALTER COLUMN "gst_rate" SET DATA TYPE numeric(5, 2);--> statement-breakpoint
ALTER TABLE "sale_orders" ADD COLUMN "customer_name" varchar(150);--> statement-breakpoint
ALTER TABLE "sale_orders" ADD COLUMN "customer_phone" varchar(10);--> statement-breakpoint
ALTER TABLE "sale_orders" ADD COLUMN "customer_address_line_1" varchar(200);--> statement-breakpoint
ALTER TABLE "sale_orders" ADD COLUMN "customer_landmark" varchar(150);--> statement-breakpoint
ALTER TABLE "sale_orders" ADD COLUMN "customer_city" varchar(100);--> statement-breakpoint
ALTER TABLE "sale_orders" ADD COLUMN "customer_district" varchar(100);--> statement-breakpoint
ALTER TABLE "sale_orders" ADD COLUMN "customer_state" varchar(100);--> statement-breakpoint
ALTER TABLE "sale_orders" ADD COLUMN "customer_state_code" "gst_place_of_supply";--> statement-breakpoint
ALTER TABLE "sale_orders" ADD COLUMN "customer_postal_code" varchar(6);--> statement-breakpoint
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_customer_or_name" CHECK (("sale_orders"."party_id" IS NULL) <> ("sale_orders"."customer_name" IS NULL));--> statement-breakpoint
ALTER TABLE "sale_order_products" ADD CONSTRAINT "sale_order_products_sale_price_non_negative" CHECK ("sale_order_products"."rate_before_gst" >= 0);--> statement-breakpoint
ALTER TABLE "sale_order_products" ADD CONSTRAINT "sale_order_products_discount_amount_valid" CHECK ("sale_order_products"."discount_amount" <= "sale_order_products"."quantity_ordered" * "sale_order_products"."rate_before_gst");
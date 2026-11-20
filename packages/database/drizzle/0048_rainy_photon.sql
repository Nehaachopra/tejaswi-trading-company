ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_total_consistent";--> statement-breakpoint
ALTER TABLE "sale_orders" DROP CONSTRAINT "sale_orders_total_consistent";--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_total_consistent" CHECK (
        "purchase_orders"."total_amount" =
        ROUND("purchase_orders"."subtotal" - "purchase_orders"."discount_amount" + "purchase_orders"."gst_amount")
      );--> statement-breakpoint
ALTER TABLE "sale_orders" ADD CONSTRAINT "sale_orders_total_consistent" CHECK (
        "sale_orders"."total_amount" =
        ROUND("sale_orders"."subtotal" - "sale_orders"."discount_amount" + "sale_orders"."gst_amount")
      );
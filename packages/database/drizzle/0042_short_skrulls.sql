CREATE TYPE "public"."order_edit_field" AS ENUM('item_added', 'item_removed', 'quantity', 'rate', 'party', 'expected_delivery', 'discount', 'remarks');--> statement-breakpoint
CREATE TABLE "order_edits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edit_id" uuid NOT NULL,
	"purchase_order_id" uuid,
	"sale_order_id" uuid,
	"edited_by_id" uuid,
	"edited_by_name" varchar(255) NOT NULL,
	"field" "order_edit_field" NOT NULL,
	"product_id" uuid,
	"from_value" varchar(1000),
	"to_value" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_edits_one_order" CHECK (("order_edits"."purchase_order_id" IS NULL) <> ("order_edits"."sale_order_id" IS NULL)),
	CONSTRAINT "order_edits_product_for_items" CHECK (("order_edits"."field" IN ('item_added', 'item_removed', 'quantity', 'rate')) = ("order_edits"."product_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "order_edits" ADD CONSTRAINT "order_edits_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_edits" ADD CONSTRAINT "order_edits_sale_order_id_sale_orders_id_fk" FOREIGN KEY ("sale_order_id") REFERENCES "public"."sale_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_edits" ADD CONSTRAINT "order_edits_edited_by_id_users_id_fk" FOREIGN KEY ("edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_edits" ADD CONSTRAINT "order_edits_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_edits_purchase_order_id_idx" ON "order_edits" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "order_edits_sale_order_id_idx" ON "order_edits" USING btree ("sale_order_id");--> statement-breakpoint
CREATE INDEX "order_edits_edit_id_idx" ON "order_edits" USING btree ("edit_id");
CREATE TABLE "deleted_products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"category_id" uuid NOT NULL,
	"category_name" varchar(50) NOT NULL,
	"sub_category_id" uuid NOT NULL,
	"sub_category_name" varchar(50) NOT NULL,
	"brand" varchar(50) NOT NULL,
	"name" varchar(50),
	"pack_size_code" "unit_quantity_code_enum" NOT NULL,
	"pack_size" integer NOT NULL,
	"hsn_4_digit" varchar(4),
	"hsn_8_digit" varchar(8),
	"image_url" text,
	"quantity_sold" integer DEFAULT 0 NOT NULL,
	"weighted_average_cost" numeric(15, 2),
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_godowns" DROP CONSTRAINT "product_godowns_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "stock_moves" DROP CONSTRAINT "stock_moves_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_order_products" DROP CONSTRAINT "purchase_order_products_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "sale_order_products" DROP CONSTRAINT "sale_order_products_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "order_edits" DROP CONSTRAINT "order_edits_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "product_cost_history" DROP CONSTRAINT "product_cost_history_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "product_price_history" DROP CONSTRAINT "product_price_history_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "stock_count_products" DROP CONSTRAINT "stock_count_products_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "drawing_products" DROP CONSTRAINT "drawing_products_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_products" DROP CONSTRAINT "purchase_products_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "sale_products" DROP CONSTRAINT "sale_products_product_id_products_id_fk";

ALTER TABLE "products" ADD COLUMN "brand" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "pack_size_code" "unit_quantity_code_enum" NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "pack_size" integer NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "products_identity_unique" ON "products" USING btree ("sub_category_id","brand",coalesce("name", ''),"pack_size_code","pack_size");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_lowercase" CHECK ("products"."brand" = lower("products"."brand"));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_unit_quantity_positive" CHECK ("products"."pack_size" > 0);
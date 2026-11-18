DROP INDEX "products_identity_unique";--> statement-breakpoint
ALTER TABLE "deleted_products" ADD COLUMN "pack_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "pack_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "products_identity_unique" ON "products" USING btree ("sub_category_id","brand",coalesce("name", ''),"pack_size_code","pack_size","pack_count") WHERE "products"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_pack_count_positive" CHECK ("products"."pack_count" > 0);
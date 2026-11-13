DROP INDEX "products_identity_unique";--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "products_identity_unique" ON "products" USING btree ("sub_category_id","brand",coalesce("name", ''),"pack_size_code","pack_size") WHERE "products"."deleted_at" IS NULL;
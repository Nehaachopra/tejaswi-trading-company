ALTER TABLE "sub_category_types" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "sub_category_types" CASCADE;--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_unit_quantity_positive";--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "unit_quantity_code";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "unit_quantity";--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_name_lowercase" CHECK ("categories"."name" = lower("categories"."name"));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_name_lowercase" CHECK ("products"."name" = lower("products"."name"));--> statement-breakpoint
ALTER TABLE "sub_categories" ADD CONSTRAINT "sub_categories_name_lowercase" CHECK ("sub_categories"."name" = lower("sub_categories"."name"));
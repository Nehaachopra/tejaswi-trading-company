ALTER TABLE "products" ALTER COLUMN "pack_size_code" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."unit_quantity_code_enum";--> statement-breakpoint
CREATE TYPE "public"."unit_quantity_code_enum" AS ENUM('KGS', 'LTR', 'BOX', 'PCS');--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "pack_size_code" SET DATA TYPE "public"."unit_quantity_code_enum" USING "pack_size_code"::"public"."unit_quantity_code_enum";
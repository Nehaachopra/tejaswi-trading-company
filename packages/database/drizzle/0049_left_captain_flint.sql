CREATE TYPE "public"."sale_return_reason" AS ENUM('damaged', 'shortage', 'wrong_item', 'other');--> statement-breakpoint
ALTER TABLE "sale_returns" ALTER COLUMN "note_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_returns" ADD COLUMN "reason_kind" "sale_return_reason" NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_returns" ADD COLUMN "exchange_sale_id" uuid;--> statement-breakpoint
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_exchange_sale_id_sales_id_fk" FOREIGN KEY ("exchange_sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;
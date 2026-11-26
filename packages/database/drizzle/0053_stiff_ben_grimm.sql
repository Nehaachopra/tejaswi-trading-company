CREATE TABLE "return_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_transaction_id" uuid NOT NULL,
	"delivery_transaction_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "return_deliveries_quantity_positive" CHECK ("return_deliveries"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "return_deliveries" ADD CONSTRAINT "return_deliveries_return_transaction_id_transactions_id_fk" FOREIGN KEY ("return_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_deliveries" ADD CONSTRAINT "return_deliveries_delivery_transaction_id_transactions_id_fk" FOREIGN KEY ("delivery_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "return_deliveries_return_idx" ON "return_deliveries" USING btree ("return_transaction_id");--> statement-breakpoint
CREATE INDEX "return_deliveries_delivery_idx" ON "return_deliveries" USING btree ("delivery_transaction_id");--> statement-breakpoint
ALTER TABLE "purchase_return_products" DROP COLUMN "pending";--> statement-breakpoint
ALTER TABLE "purchase_return_products" DROP COLUMN "received_at";
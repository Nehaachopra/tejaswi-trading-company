CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"ledger_id" uuid NOT NULL,
	"date_time" timestamp with time zone DEFAULT now() NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"transaction_type" "ledger_transaction_type" NOT NULL,
	"is_contra" boolean DEFAULT false NOT NULL,
	"balance" numeric(15, 2) NOT NULL,
	"balance_type" "ledger_transaction_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_amount_and_balance_non_negative" CHECK ("ledger_entries"."amount" >= 0 AND "ledger_entries"."balance" >= 0)
);
--> statement-breakpoint
ALTER TABLE "ledgers" DROP CONSTRAINT "ledger_amount_and_balance_non_negative";--> statement-breakpoint
ALTER TABLE "ledgers" DROP CONSTRAINT "ledgers_transaction_id_transactions_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_order_products" DROP CONSTRAINT "purchase_order_products_product_id_product_godowns_id_fk";
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_created_by_users_id_fk";
--> statement-breakpoint
DROP INDEX "ledger_table_ledger_id_idx";--> statement-breakpoint
DROP INDEX "ledgers_ledger_master_datetime_idx";--> statement-breakpoint
DROP INDEX "purchase_order_product_godown_id_idx";--> statement-breakpoint
DROP INDEX "deposits_assigned_id_unique";--> statement-breakpoint
DROP INDEX "drawings_assigned_id_unique";--> statement-breakpoint
DROP INDEX "payments_assigned_id_unique";--> statement-breakpoint
DROP INDEX "purchase_returns_type_assigned_id_unique";--> statement-breakpoint
DROP INDEX "receipts_assigned_id_unique";--> statement-breakpoint
DROP INDEX "sale_returns_type_assigned_id_unique";--> statement-breakpoint
DROP INDEX "withdrawal_assigned_id_unique";--> statement-breakpoint
ALTER TABLE "ledgers" ALTER COLUMN "ledger_master_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ledgers" ADD COLUMN "name" varchar(150) NOT NULL;--> statement-breakpoint
ALTER TABLE "ledgers" ADD COLUMN "ledger_group_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "ledgers" ADD COLUMN "reference_table" varchar(30);--> statement-breakpoint
ALTER TABLE "ledgers" ADD COLUMN "reference_id" uuid;--> statement-breakpoint
ALTER TABLE "ledgers" ADD COLUMN "balance_type" "ledger_transaction_type" DEFAULT 'debit' NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_groups" ADD COLUMN "balance_type" "ledger_transaction_type" DEFAULT 'debit' NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_masters" ADD COLUMN "balance_type" "ledger_transaction_type" DEFAULT 'debit' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "assigned_id" varchar(30) NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "created_by_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "created_by_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_entries_transaction_id_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_ledger_datetime_idx" ON "ledger_entries" USING btree ("ledger_id","date_time");--> statement-breakpoint
ALTER TABLE "ledgers" ADD CONSTRAINT "ledgers_ledger_group_id_ledger_groups_id_fk" FOREIGN KEY ("ledger_group_id") REFERENCES "public"."ledger_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_products" ADD CONSTRAINT "purchase_order_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledgers_ledger_group_id_idx" ON "ledgers" USING btree ("ledger_group_id");--> statement-breakpoint
CREATE INDEX "ledgers_ledger_master_id_idx" ON "ledgers" USING btree ("ledger_master_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledgers_master_reference_unique" ON "ledgers" USING btree ("ledger_master_id","reference_table","reference_id") WHERE "ledgers"."reference_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ledgers_group_name_unique" ON "ledgers" USING btree ("ledger_group_id","name") WHERE "ledgers"."reference_id" IS NULL;--> statement-breakpoint
CREATE INDEX "purchase_order_product_id_idx" ON "purchase_order_products" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_type_assigned_id_unique" ON "transactions" USING btree ("type","assigned_id");--> statement-breakpoint
ALTER TABLE "ledgers" DROP COLUMN "transaction_id";--> statement-breakpoint
ALTER TABLE "ledgers" DROP COLUMN "date_time";--> statement-breakpoint
ALTER TABLE "ledgers" DROP COLUMN "amount";--> statement-breakpoint
ALTER TABLE "ledgers" DROP COLUMN "transaction_type";--> statement-breakpoint
ALTER TABLE "ledger_masters" DROP COLUMN "reference_table";--> statement-breakpoint
ALTER TABLE "ledger_masters" DROP COLUMN "reference_id";--> statement-breakpoint
ALTER TABLE "deposits" DROP COLUMN "assigned_id";--> statement-breakpoint
ALTER TABLE "drawings" DROP COLUMN "assigned_id";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "assigned_id";--> statement-breakpoint
ALTER TABLE "purchases" DROP COLUMN "assigned_id";--> statement-breakpoint
ALTER TABLE "purchase_returns" DROP COLUMN "assigned_id";--> statement-breakpoint
ALTER TABLE "receipts" DROP COLUMN "assigned_id";--> statement-breakpoint
ALTER TABLE "sales" DROP COLUMN "assigned_id";--> statement-breakpoint
ALTER TABLE "sale_returns" DROP COLUMN "assigned_id";--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "created_by";--> statement-breakpoint
ALTER TABLE "withdrawals" DROP COLUMN "assigned_id";--> statement-breakpoint
ALTER TABLE "ledgers" ADD CONSTRAINT "ledgers_balance_non_negative" CHECK ("ledgers"."balance" >= 0);--> statement-breakpoint
ALTER TABLE "ledgers" ADD CONSTRAINT "ledgers_reference_both_or_neither" CHECK (("ledgers"."reference_table" IS NULL) = ("ledgers"."reference_id" IS NULL));
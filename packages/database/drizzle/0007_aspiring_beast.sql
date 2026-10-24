ALTER TABLE "transactions" ALTER COLUMN "date_time" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "amount" numeric(15, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "contras" DROP COLUMN "remarks";--> statement-breakpoint
ALTER TABLE "others" DROP COLUMN "remark";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "remarks";--> statement-breakpoint
ALTER TABLE "payments" DROP COLUMN "voucher_url";--> statement-breakpoint
ALTER TABLE "receipts" DROP COLUMN "remarks";--> statement-breakpoint
ALTER TABLE "receipts" DROP COLUMN "voucher_url";
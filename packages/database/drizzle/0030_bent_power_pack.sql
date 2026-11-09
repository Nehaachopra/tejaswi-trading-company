ALTER TABLE "receipts" ADD COLUMN "hsn_snapshot" varchar(8);--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "gst_rate" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "taxable_amount" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "cgst_amount" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "sgst_amount" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "igst_amount" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_gst_fields_consistent" CHECK ((
        "receipts"."gst_rate" IS NULL
        AND "receipts"."hsn_snapshot" IS NULL
        AND "receipts"."taxable_amount" IS NULL
        AND "receipts"."cgst_amount" IS NULL
        AND "receipts"."sgst_amount" IS NULL
        AND "receipts"."igst_amount" IS NULL
      ) OR (
        "receipts"."gst_rate" IS NOT NULL
        AND "receipts"."hsn_snapshot" IS NOT NULL
        AND "receipts"."taxable_amount" IS NOT NULL
        AND "receipts"."taxable_amount" > 0
        AND "receipts"."taxable_amount" + coalesce("receipts"."cgst_amount", 0) + coalesce("receipts"."sgst_amount", 0) + coalesce("receipts"."igst_amount", 0) = "receipts"."amount"
      ));
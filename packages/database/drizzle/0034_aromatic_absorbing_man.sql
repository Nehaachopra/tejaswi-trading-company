ALTER TABLE "salaries" DROP CONSTRAINT "salaries_bank_account_for_bank";--> statement-breakpoint
ALTER TABLE "salary_postings" DROP CONSTRAINT "salary_postings_paid_transaction_id_transactions_id_fk";
--> statement-breakpoint
DROP INDEX "salaries_salary_posting_id_unique";--> statement-breakpoint
CREATE INDEX "salaries_salary_posting_id_idx" ON "salaries" USING btree ("salary_posting_id");--> statement-breakpoint
ALTER TABLE "salaries" DROP COLUMN "voucher_url";--> statement-breakpoint
ALTER TABLE "salary_postings" DROP COLUMN "paid_transaction_id";--> statement-breakpoint
ALTER TABLE "salaries" ADD CONSTRAINT "salaries_cash_or_bank" CHECK (("salaries"."settled_in" = 'cash' AND "salaries"."bank_details_id" IS NULL)
        OR ("salaries"."settled_in" = 'bank' AND "salaries"."bank_details_id" IS NOT NULL));
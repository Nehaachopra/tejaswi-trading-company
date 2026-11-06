DROP INDEX "payment_bank_details_payment_id_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "payment_bank_details_payment_account_unique" ON "payment_bank_details" USING btree ("payment_id","bank_details_id");--> statement-breakpoint
CREATE INDEX "payment_bank_details_payment_id_idx" ON "payment_bank_details" USING btree ("payment_id");
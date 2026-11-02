CREATE TYPE "public"."lender_type" AS ENUM('bank', 'nbfc', 'individual');--> statement-breakpoint
ALTER TABLE "dues" ADD COLUMN "lender_type" "lender_type";--> statement-breakpoint
ALTER TABLE "dues" ADD CONSTRAINT "dues_lender_on_loan_taken" CHECK ("dues"."lender_type" IS NULL OR "dues"."kind" = 'loan_taken');
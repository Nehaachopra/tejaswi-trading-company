ALTER TABLE "loans" DROP CONSTRAINT "loans_tenure_valid";--> statement-breakpoint
ALTER TABLE "loans" DROP CONSTRAINT "loans_installment_valid";--> statement-breakpoint
ALTER TABLE "loans" DROP CONSTRAINT "loans_interest_rate_valid";--> statement-breakpoint
ALTER TABLE "loans" ALTER COLUMN "interest_rate" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "loans" ALTER COLUMN "frequency" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "parties" ALTER COLUMN "short_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "loans" DROP COLUMN "interest_type";--> statement-breakpoint
ALTER TABLE "loans" DROP COLUMN "repayment";--> statement-breakpoint
ALTER TABLE "loans" DROP COLUMN "tenure_months";--> statement-breakpoint
ALTER TABLE "loans" DROP COLUMN "installment";--> statement-breakpoint
ALTER TABLE "loans" DROP COLUMN "first_due_on";--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_interest_rate_valid" CHECK ("loans"."interest_rate" >= 0 AND "loans"."interest_rate" <= 100);--> statement-breakpoint
DROP TYPE "public"."loan_interest_type";--> statement-breakpoint
DROP TYPE "public"."loan_repayment";
ALTER TABLE "salary_advance_deductions" DROP CONSTRAINT "salary_advance_deductions_month_range";--> statement-breakpoint
ALTER TABLE "salary_advance_deductions" ALTER COLUMN "year" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "salary_advance_deductions" ALTER COLUMN "month" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "salary_advance_deductions" ADD COLUMN "payment_salary_id" uuid;--> statement-breakpoint
ALTER TABLE "salary_advance_deductions" ADD CONSTRAINT "salary_advance_deductions_payment_salary_id_salaries_id_fk" FOREIGN KEY ("payment_salary_id") REFERENCES "public"."salaries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "salary_advance_deductions_advance_payment_unique" ON "salary_advance_deductions" USING btree ("salary_id","payment_salary_id");--> statement-breakpoint
ALTER TABLE "salary_advance_deductions" ADD CONSTRAINT "salary_advance_deductions_payment_or_month" CHECK (("salary_advance_deductions"."payment_salary_id" IS NOT NULL AND "salary_advance_deductions"."year" IS NULL AND "salary_advance_deductions"."month" IS NULL)
        OR ("salary_advance_deductions"."payment_salary_id" IS NULL AND "salary_advance_deductions"."year" IS NOT NULL AND "salary_advance_deductions"."month" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "salary_advance_deductions" ADD CONSTRAINT "salary_advance_deductions_month_range" CHECK ("salary_advance_deductions"."month" IS NULL OR "salary_advance_deductions"."month" BETWEEN 1 AND 12);
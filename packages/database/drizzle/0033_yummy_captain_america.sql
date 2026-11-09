ALTER TYPE "public"."party_type" ADD VALUE 'employee';--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "party_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employees_party_id_unique" ON "employees" USING btree ("party_id");--> statement-breakpoint
ALTER TABLE "employees" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "employees" DROP COLUMN "country_code";--> statement-breakpoint
ALTER TABLE "employees" DROP COLUMN "phone";--> statement-breakpoint
ALTER TABLE "employees" DROP COLUMN "address";--> statement-breakpoint
ALTER TABLE "employees" DROP COLUMN "is_active";
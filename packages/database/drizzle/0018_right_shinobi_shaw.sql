ALTER TABLE "godowns" DROP CONSTRAINT "landlord_contact_fields_together";--> statement-breakpoint
ALTER TABLE "godowns" DROP CONSTRAINT "godowns_rented_requires_rent";--> statement-breakpoint
ALTER TABLE "godowns" DROP CONSTRAINT "godowns_owned_has_no_rental_details";--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "is_landlord" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "godowns" DROP COLUMN "landlord_name";--> statement-breakpoint
ALTER TABLE "godowns" DROP COLUMN "landlord_country_code";--> statement-breakpoint
ALTER TABLE "godowns" DROP COLUMN "landlord_number";--> statement-breakpoint
ALTER TABLE "godowns" ADD CONSTRAINT "godowns_rented_requires_rent" CHECK ("godowns"."ownership" <> 'rented'
      OR ("godowns"."rent" IS NOT NULL AND "godowns"."rent" > 0));--> statement-breakpoint
ALTER TABLE "godowns" ADD CONSTRAINT "godowns_owned_has_no_rental_details" CHECK ("godowns"."ownership" <> 'owned'
      OR (
        "godowns"."rent" IS NULL
        AND "godowns"."rent_timing_in_months" IS NULL
        AND "godowns"."landlord_id" IS NULL
      ));
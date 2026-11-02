CREATE TABLE "landlords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(150) NOT NULL,
	"short_name" varchar(20),
	"country_code" varchar(5) DEFAULT '+91' NOT NULL,
	"phone" varchar(20),
	"email" varchar(254),
	"pan" varchar(10),
	"gstin" varchar(15),
	"is_active" boolean DEFAULT true NOT NULL,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "godowns" DROP CONSTRAINT "godowns_landlord_id_parties_id_fk";
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "payee_landlord_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "landlords_short_name_unique" ON "landlords" USING btree ("short_name");--> statement-breakpoint
CREATE UNIQUE INDEX "landlords_phone_unique" ON "landlords" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "landlords_gstin_unique" ON "landlords" USING btree ("gstin");--> statement-breakpoint
ALTER TABLE "godowns" ADD CONSTRAINT "godowns_landlord_id_landlords_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."landlords"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payee_landlord_id_landlords_id_fk" FOREIGN KEY ("payee_landlord_id") REFERENCES "public"."landlords"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parties" DROP COLUMN "is_landlord";
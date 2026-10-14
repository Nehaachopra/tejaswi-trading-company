ALTER TABLE "transactions" DROP CONSTRAINT "transactions_created_by_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "created_by_name" SET DATA TYPE varchar(30);--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
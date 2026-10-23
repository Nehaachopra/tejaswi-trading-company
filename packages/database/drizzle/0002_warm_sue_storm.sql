ALTER TABLE "product_godowns" ALTER COLUMN "quantity" SET DATA TYPE integer;--> statement-breakpoint
CREATE UNIQUE INDEX "godowns_name_unique" ON "godowns" USING btree (lower("godown_name"));
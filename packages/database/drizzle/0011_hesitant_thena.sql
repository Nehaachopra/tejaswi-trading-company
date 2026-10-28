CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "parties_name_trgm_idx" ON "parties" USING gin (lower("name") gin_trgm_ops);
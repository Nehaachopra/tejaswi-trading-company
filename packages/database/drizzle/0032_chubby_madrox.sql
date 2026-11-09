ALTER TYPE "public"."party_type" ADD VALUE 'lender';--> statement-breakpoint
ALTER TYPE "public"."party_type" ADD VALUE 'agent';--> statement-breakpoint
ALTER TABLE "parties" ADD COLUMN "types" "party_type"[] DEFAULT '{}'::party_type[] NOT NULL;
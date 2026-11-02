CREATE TABLE "stored_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"kind" varchar(30) NOT NULL,
	"version" integer NOT NULL,
	"reason" varchar(20) NOT NULL,
	"file_key" varchar(255),
	"file_bytes" integer,
	"file_hash" varchar(64),
	"stored_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stored_documents_version_check" CHECK ("stored_documents"."version" >= 1),
	CONSTRAINT "stored_documents_reason_check" CHECK ("stored_documents"."reason" IN ('created', 'cancelled')),
	CONSTRAINT "stored_documents_file_check" CHECK (("stored_documents"."stored_at" IS NULL AND "stored_documents"."file_key" IS NULL AND "stored_documents"."file_bytes" IS NULL AND "stored_documents"."file_hash" IS NULL)
        OR ("stored_documents"."stored_at" IS NOT NULL AND "stored_documents"."file_key" IS NOT NULL AND "stored_documents"."file_bytes" IS NOT NULL AND "stored_documents"."file_hash" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "stored_documents" ADD CONSTRAINT "stored_documents_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stored_documents_transaction_kind_version_unique" ON "stored_documents" USING btree ("transaction_id","kind","version");--> statement-breakpoint
CREATE INDEX "stored_documents_waiting_idx" ON "stored_documents" USING btree ("created_at") WHERE "stored_documents"."stored_at" IS NULL;
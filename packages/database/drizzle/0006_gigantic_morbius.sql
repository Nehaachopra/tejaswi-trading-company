CREATE TABLE "ifsc_branches" (
	"ifsc" varchar(11) PRIMARY KEY NOT NULL,
	"bank" varchar(150) NOT NULL,
	"branch" varchar(150) NOT NULL,
	"city" varchar(100),
	"district" varchar(100),
	"state" varchar(100),
	"loaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ifsc_branches_bank_branch_idx" ON "ifsc_branches" USING btree (lower("bank"),lower("branch"));
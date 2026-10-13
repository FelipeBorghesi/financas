CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"pluggy_account_id" text,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_pluggy_account_id_unique" UNIQUE("pluggy_account_id")
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"category" text PRIMARY KEY NOT NULL,
	"amount_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"pattern" text NOT NULL,
	"category" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"trigger" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"new_count" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"description" text NOT NULL,
	"merchant_key" text NOT NULL,
	"category_manual" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rules_pattern_lower" ON "rules" USING btree (lower("pattern"));--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_source_external_id" ON "transactions" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "transactions_date" ON "transactions" USING btree ("date");
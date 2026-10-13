ALTER TABLE "rules" ADD COLUMN "field" text DEFAULT 'key' NOT NULL;--> statement-breakpoint
ALTER TABLE "rules" ADD COLUMN "only_negative" boolean DEFAULT false NOT NULL;
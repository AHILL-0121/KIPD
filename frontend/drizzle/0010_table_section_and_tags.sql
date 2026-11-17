ALTER TABLE "tables" ADD COLUMN "section" text;--> statement-breakpoint
ALTER TABLE "tables" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb;

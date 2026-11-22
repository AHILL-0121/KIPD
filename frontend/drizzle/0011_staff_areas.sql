ALTER TABLE "staff" ADD COLUMN "areas" text DEFAULT 'both' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_areas_check" CHECK ("staff"."areas" in ('hotel','restaurant','both'));--> statement-breakpoint
ALTER TABLE "staff_invites" ADD COLUMN "areas" text DEFAULT 'both' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_areas_check" CHECK ("staff_invites"."areas" in ('hotel','restaurant','both'));

-- Access requests inbox for /sign-up onboarding pipeline
CREATE TABLE IF NOT EXISTS "access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"company" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"tenant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action,
	CONSTRAINT "access_requests_status_check" CHECK ("status" in ('pending','approved','rejected'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_access_requests_status_created" ON "access_requests" USING btree ("status","created_at");

ALTER TABLE "rooms" DROP CONSTRAINT IF EXISTS "rooms_status_check";--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_status_check" CHECK ("rooms"."status" in ('available','occupied','dirty','cleaning','inspected','maintenance','blocked'));--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"booking_id" uuid,
	"amount" numeric(10, 2) NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"reason" text NOT NULL,
	"processed_by" text,
	"processed_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_method_check" CHECK ("refunds"."method" in ('cash','upi','card','bank_transfer','razorpay')),
	CONSTRAINT "refunds_amount_check" CHECK ("refunds"."amount" > 0)
);--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "fk_refunds_bill" FOREIGN KEY ("tenant_id","bill_id") REFERENCES "public"."bills"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "fk_refunds_booking" FOREIGN KEY ("tenant_id","booking_id") REFERENCES "public"."bookings"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_refunds_bill" ON "refunds" USING btree ("bill_id");--> statement-breakpoint
CREATE TABLE "tenant_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_name" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "tenant_audit_logs" ADD CONSTRAINT "tenant_audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tenant_audit_tenant_created" ON "tenant_audit_logs" USING btree ("tenant_id","created_at");

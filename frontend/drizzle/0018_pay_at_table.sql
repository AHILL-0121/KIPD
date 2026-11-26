-- Guest Pay at Table payment intents
CREATE TABLE IF NOT EXISTS "upi_payment_intents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "bill_id" uuid NOT NULL,
  "amount" numeric(10, 2) NOT NULL,
  "currency" text DEFAULT 'INR' NOT NULL,
  "razorpay_order_id" text,
  "razorpay_payment_id" text,
  "razorpay_payment_link_id" text,
  "payment_link_url" text,
  "short_url" text,
  "status" text DEFAULT 'created' NOT NULL,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "upi_payment_intents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "fk_upi_intents_bill" FOREIGN KEY ("tenant_id","bill_id") REFERENCES "public"."bills"("tenant_id","id"),
  CONSTRAINT "upi_intent_status_check" CHECK ("status" in ('created','paid','expired','failed')),
  CONSTRAINT "upi_intent_amount_check" CHECK ("amount" > 0)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upi_intent_bill" ON "upi_payment_intents" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_upi_intent_tenant" ON "upi_payment_intents" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "upi_payment_intents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "upi_payment_intents" USING (tenant_id::text = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

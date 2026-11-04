-- Settings > Payments and Razorpay (checklist 7a, step 2).
--   * tenants.payment_settings: per-property choices (manual methods, online links, suggested deposit). {} = defaults.
--   * payments.razorpay_payment_id, unique: a webhook delivered twice can never count a payment twice.
--   * payments_method_check gains razorpay. stripe stays allowed so old rows remain valid.
-- Only adds and widens, so no existing row can break and no pre-flight is needed.
ALTER TABLE "payments" DROP CONSTRAINT "payments_method_check";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "razorpay_payment_id" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "payment_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_razorpay_payment_uq" ON "payments" USING btree ("razorpay_payment_id") WHERE "payments"."razorpay_payment_id" is not null;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_method_check" CHECK ("payments"."method" in ('cash','upi','card','bank_transfer','razorpay','stripe'));
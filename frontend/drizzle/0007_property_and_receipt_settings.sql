-- Settings that used to be thrown away or kept only in the browser.
--   * tenants.property_settings: currency, check-in and check-out time. {} = defaults. (name and timezone reuse existing columns.)
--   * tenants.receipt_settings: receipt header, subtext, footer. {} = defaults.
-- Only adds, so no existing row can break and no pre-flight is needed.
ALTER TABLE "tenants" ADD COLUMN "property_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "receipt_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;
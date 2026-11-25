-- Drop unused legacy tables (replaced by per-tenant Razorpay webhooks & direct QR/links)
DROP TABLE IF EXISTS "webhook_logs" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "webhooks" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "upi_payment_intents" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "notification_listener_config" CASCADE;--> statement-breakpoint

-- Enable PostgreSQL Row-Level Security (RLS) on every tenant-owned table as a second line of defence.
-- Table owners (superuser / neondb_owner) continue working without FORCE ROW LEVEL SECURITY, while any
-- non-owner role or explicit SET ROLE must satisfy `app.current_tenant_id`.
ALTER TABLE "properties" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "properties" USING (tenant_id::text = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));--> statement-breakpoint
ALTER TABLE "room_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "room_types" USING (tenant_id::text = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));--> statement-breakpoint
ALTER TABLE "rooms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "rooms" USING (tenant_id::text = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));--> statement-breakpoint
ALTER TABLE "guests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "guests" USING (tenant_id::text = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));--> statement-breakpoint
ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "bookings" USING (tenant_id::text = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));--> statement-breakpoint
ALTER TABLE "outlets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "outlets" USING (tenant_id::text = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));--> statement-breakpoint
ALTER TABLE "menu_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "menu_categories" USING (tenant_id::text = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));--> statement-breakpoint
ALTER TABLE "menu_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "menu_items" USING (tenant_id::text = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));--> statement-breakpoint
ALTER TABLE "tables" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tables" USING (tenant_id::text = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "orders" USING (tenant_id::text = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));--> statement-breakpoint
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "order_items" USING (tenant_id::text = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));--> statement-breakpoint
ALTER TABLE "bills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "bills" USING (tenant_id::text = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "payments" USING (tenant_id::text = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));--> statement-breakpoint
ALTER TABLE "refunds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "refunds" USING (tenant_id::text = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));--> statement-breakpoint
ALTER TABLE "credit_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "credit_notes" USING (tenant_id::text = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));--> statement-breakpoint
ALTER TABLE "invoice_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "invoice_counters" USING (tenant_id::text = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));--> statement-breakpoint
ALTER TABLE "tenant_audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tenant_audit_logs" USING (tenant_id::text = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));--> statement-breakpoint
ALTER TABLE "staff" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "staff" USING (tenant_id::text = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));--> statement-breakpoint
ALTER TABLE "staff_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "staff_invites" USING (tenant_id::text = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));--> statement-breakpoint
ALTER TABLE "razorpay_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "razorpay_accounts" USING (tenant_id::text = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));--> statement-breakpoint
ALTER TABLE "payment_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "payment_events" USING (tenant_id::text = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

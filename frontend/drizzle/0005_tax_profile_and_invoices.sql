-- Tax profile and numbered invoices for hotel stays (checklist 7a, "Room GST" and the A4 invoice).
--   * tenants.tax_settings: GSTIN, address, state, how room GST is charged, invoice prefix and footer. {} = no GST.
--   * bills.invoice_*: the invoice number, its date and a frozen copy of who billed whom, set together and only once.
--   * invoice_counters: the last number given out per hotel and financial year, so numbers have no gaps or repeats.
-- Only adds, so no existing row can break and no pre-flight is needed. Existing bills simply have no invoice yet.
CREATE TABLE "invoice_counters" (
	"tenant_id" uuid NOT NULL,
	"fy" text NOT NULL,
	"last" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_counters_tenant_id_fy_pk" PRIMARY KEY("tenant_id","fy"),
	CONSTRAINT "invoice_counters_last_check" CHECK ("invoice_counters"."last" >= 0)
);
--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "invoice_number" text;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "invoice_seq" integer;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "invoice_issued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "invoice_data" jsonb;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "tax_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_counters" ADD CONSTRAINT "invoice_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bills_invoice_number_uq" ON "bills" USING btree ("tenant_id","invoice_number") WHERE "bills"."invoice_number" is not null;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_invoice_complete_check" CHECK (("bills"."invoice_number" is null) = ("bills"."invoice_data" is null) and ("bills"."invoice_number" is null) = ("bills"."invoice_issued_at" is null));
-- Credit notes, and restaurant bills charged to a guest's room (checklist 7a, "credit notes and posting to room").
--   * credit_notes: numbered (own series, CN/26-27/0001) and frozen when issued, like invoices.
--   * invoice_counters.series: invoices and credit notes each count 1, 2, 3 on their own. Existing rows are the invoice series.
--   * bills.posted_to_bill_id and the 'posted' status: a restaurant bill whose lines now sit on a stay bill.
-- Only adds and widens, so no existing row can break and no pre-flight is needed.
CREATE TABLE "credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"number" text NOT NULL,
	"seq" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"reason" text NOT NULL,
	"data" jsonb NOT NULL,
	"issued_by" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_notes_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "credit_notes_amount_check" CHECK ("credit_notes"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "bills" DROP CONSTRAINT "bills_status_check";--> statement-breakpoint
ALTER TABLE "invoice_counters" ADD COLUMN "series" text DEFAULT 'invoice' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_counters" DROP CONSTRAINT "invoice_counters_tenant_id_fy_pk";--> statement-breakpoint
ALTER TABLE "invoice_counters" ADD CONSTRAINT "invoice_counters_tenant_id_fy_series_pk" PRIMARY KEY("tenant_id","fy","series");--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "posted_to_bill_id" uuid;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "fk_credit_notes_bill" FOREIGN KEY ("tenant_id","bill_id") REFERENCES "public"."bills"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_number_uq" ON "credit_notes" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE INDEX "idx_credit_notes_bill" ON "credit_notes" USING btree ("bill_id");--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "fk_bills_posted_to" FOREIGN KEY ("tenant_id","posted_to_bill_id") REFERENCES "public"."bills"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_posted_check" CHECK (("bills"."status" = 'posted') = ("bills"."posted_to_bill_id" is not null));--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_status_check" CHECK ("bills"."status" in ('open','paid','partial','void','posted'));--> statement-breakpoint
ALTER TABLE "invoice_counters" ADD CONSTRAINT "invoice_counters_series_check" CHECK ("invoice_counters"."series" in ('invoice','credit_note'));
CREATE TABLE "razorpay_accounts" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"key_id" text NOT NULL,
	"key_secret_enc" text NOT NULL,
	"webhook_secret_enc" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "razorpay_accounts_key_id_check" CHECK ("razorpay_accounts"."key_id" ~ '^rzp_(test|live)_[A-Za-z0-9]+$')
);
--> statement-breakpoint
ALTER TABLE "razorpay_accounts" ADD CONSTRAINT "razorpay_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
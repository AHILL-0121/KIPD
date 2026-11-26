-- Inventory ingredients, recipe costing, and low-stock alerts
CREATE TABLE IF NOT EXISTS "ingredients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "outlet_id" uuid NOT NULL,
  "name" text NOT NULL,
  "unit" text DEFAULT 'unit' NOT NULL,
  "stock_qty" numeric(12, 3) DEFAULT '0' NOT NULL,
  "low_stock_threshold" numeric(12, 3) DEFAULT '10' NOT NULL,
  "cost_per_unit" numeric(10, 2),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ingredients_tenant_id_uq" UNIQUE("tenant_id","id"),
  CONSTRAINT "ingredients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "fk_ingredients_outlet" FOREIGN KEY ("tenant_id","outlet_id") REFERENCES "public"."outlets"("tenant_id","id"),
  CONSTRAINT "ingredients_stock_check" CHECK ("stock_qty" >= 0),
  CONSTRAINT "ingredients_threshold_check" CHECK ("low_stock_threshold" >= 0),
  CONSTRAINT "ingredients_cost_check" CHECK ("cost_per_unit" is null or "cost_per_unit" >= 0)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ingredients_tenant" ON "ingredients" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ingredients_outlet" ON "ingredients" USING btree ("outlet_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recipe_items" (
  "tenant_id" uuid NOT NULL,
  "menu_item_id" uuid NOT NULL,
  "ingredient_id" uuid NOT NULL,
  "quantity_per_unit" numeric(10, 3) NOT NULL,
  CONSTRAINT "recipe_items_pkey" PRIMARY KEY("menu_item_id","ingredient_id"),
  CONSTRAINT "recipe_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "fk_recipe_items_menu_item" FOREIGN KEY ("tenant_id","menu_item_id") REFERENCES "public"."menu_items"("tenant_id","id") ON DELETE cascade,
  CONSTRAINT "fk_recipe_items_ingredient" FOREIGN KEY ("tenant_id","ingredient_id") REFERENCES "public"."ingredients"("tenant_id","id") ON DELETE cascade,
  CONSTRAINT "recipe_items_qty_check" CHECK ("quantity_per_unit" > 0)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_recipe_items_ingredient" ON "recipe_items" USING btree ("ingredient_id");--> statement-breakpoint
ALTER TABLE "ingredients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "ingredients" USING (tenant_id::text = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));--> statement-breakpoint
ALTER TABLE "recipe_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "recipe_items" USING (tenant_id::text = current_setting('app.current_tenant_id', true)) WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true));

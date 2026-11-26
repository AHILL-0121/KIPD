-- Guest profile notes alongside existing jsonb preferences
ALTER TABLE "guests" ADD COLUMN IF NOT EXISTS "notes" text;

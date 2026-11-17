ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_type_check";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_type_check" CHECK ("orders"."type" in ('dine_in','room_service','take_away'));

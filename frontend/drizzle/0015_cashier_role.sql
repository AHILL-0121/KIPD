-- Add optional 'cashier' role (restaurant billing only)
ALTER TABLE "staff" DROP CONSTRAINT IF EXISTS "staff_role_check";--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_role_check" CHECK (role in ('owner','manager','front_desk','waiter','kitchen','cashier'));--> statement-breakpoint
ALTER TABLE "staff_invites" DROP CONSTRAINT IF EXISTS "staff_invites_role_check";--> statement-breakpoint
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_role_check" CHECK (role in ('manager','front_desk','waiter','kitchen','cashier'));

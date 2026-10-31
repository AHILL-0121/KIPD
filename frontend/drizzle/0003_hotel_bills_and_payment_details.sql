-- Hotel billing, step 1 (checklist 7a). The generated column and constraint changes are wrapped in
-- hand-written steps, because the new rules must only be added AFTER existing rows are put right.
--
--   * bills.kind: 'stay' (a hotel booking) or 'restaurant'. Every existing bill that points at a booking is a stay.
--   * bills.status gains 'void' (the bill of a cancelled booking).
--   * One live stay bill per booking (partial unique index), so confirming twice cannot bill a stay twice.
--   * A bill can never be paid more than its total (bills_paid_check).
--   * payments gain reference, received_by, received_by_user_id and note, and the method 'bank_transfer'.
--   * Backfill: every CONFIRMED or CHECKED-IN booking that has no bill gets one (unpaid, no tax added).
--     Finished (checked out) and cancelled bookings are left alone, so old stays do not show up as unpaid.
--
-- Pre-flight: refuses, with a clear message and no changes, if existing data would break a new rule.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM "bills"
  WHERE "paid_amount" < 0 OR "paid_amount" > "total_amount";
  IF n > 0 THEN
    RAISE EXCEPTION 'Migration 0003 stopped: % bill(s) have a paid amount that is negative or larger than the total. Correct those bills, then run the migration again. Nothing was changed.', n;
  END IF;

  SELECT count(*) INTO n FROM (
    SELECT 1 FROM "bills" WHERE "booking_id" IS NOT NULL GROUP BY "tenant_id", "booking_id" HAVING count(*) > 1
  ) d;
  IF n > 0 THEN
    RAISE EXCEPTION 'Migration 0003 stopped: % booking(s) already have more than one bill. A booking may have only one live stay bill. Keep one bill per booking, then run the migration again. Nothing was changed.', n;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "bills" DROP CONSTRAINT "bills_status_check";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_method_check";--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "kind" text DEFAULT 'restaurant' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "received_by" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "received_by_user_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "note" text;--> statement-breakpoint
UPDATE "bills" SET "kind" = 'stay' WHERE "booking_id" IS NOT NULL;--> statement-breakpoint
INSERT INTO "bills" ("id", "tenant_id", "booking_id", "kind", "guest_id", "total_amount", "paid_amount", "status", "items_breakdown", "created_at")
SELECT
  gen_random_uuid(), b."tenant_id", b."id", 'stay', b."guest_id", b."total_amount", 0, 'open',
  jsonb_build_object(
    'items', jsonb_build_array(jsonb_build_object(
      'name', 'Room ' || r."room_number" || ' (' || rt."name" || '), ' || n.nights || CASE WHEN n.nights = 1 THEN ' night' ELSE ' nights' END,
      'qty', n.nights,
      'rate', round(b."total_amount" / n.nights, 2),
      'amt', b."total_amount")),
    'subtotal', b."total_amount", 'cgst', 0, 'sgst', 0, 'total', b."total_amount"),
  b."created_at"
FROM "bookings" b
JOIN "rooms" r ON r."tenant_id" = b."tenant_id" AND r."id" = b."room_id"
JOIN "room_types" rt ON rt."tenant_id" = r."tenant_id" AND rt."id" = r."room_type_id"
CROSS JOIN LATERAL (SELECT greatest(1, ceil(extract(epoch FROM (b."check_out_date" - b."check_in_date")) / 86400))::int AS nights) n
WHERE b."status" IN ('confirmed', 'checked_in')
  AND NOT EXISTS (SELECT 1 FROM "bills" x WHERE x."tenant_id" = b."tenant_id" AND x."booking_id" = b."id");--> statement-breakpoint
CREATE UNIQUE INDEX "bills_live_stay_uq" ON "bills" USING btree ("tenant_id","booking_id") WHERE "bills"."kind" = 'stay' and "bills"."status" <> 'void';--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_kind_check" CHECK ("bills"."kind" in ('stay','restaurant'));--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_stay_booking_check" CHECK ("bills"."kind" <> 'stay' or "bills"."booking_id" is not null);--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_paid_check" CHECK ("bills"."paid_amount" >= 0 and "bills"."paid_amount" <= "bills"."total_amount");--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_status_check" CHECK ("bills"."status" in ('open','paid','partial','void'));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_method_check" CHECK ("payments"."method" in ('cash','upi','card','bank_transfer','stripe'));

-- Custom migration (Drizzle cannot express EXCLUDE constraints, so this is hand-written SQL).
--
-- Guarantees at the database level that one room can never have two overlapping ACTIVE bookings,
-- even when two requests for the last room arrive at the same instant. The application also checks
-- first (to give a friendly message); this is the part that cannot be raced.
--
-- Ranges are half-open [check-in, check-out), so a guest leaving at 11:00 and another arriving at 14:00
-- (or even 11:00) on the same day do NOT conflict. Cancelled and completed bookings never block a room.
--
-- Needs the btree_gist extension so a UUID (room_id) can take part in a GiST index. It is a "trusted"
-- extension, so the database owner can create it.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
-- Pre-flight: refuse, with a clear message and no changes, if existing data already overlaps.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
  FROM "bookings" a
  JOIN "bookings" b ON a."room_id" = b."room_id" AND a."id" < b."id"
  WHERE a."status" IN ('pending', 'confirmed', 'checked_in')
    AND b."status" IN ('pending', 'confirmed', 'checked_in')
    AND tstzrange(a."check_in_date", a."check_out_date", '[)') && tstzrange(b."check_in_date", b."check_out_date", '[)');
  IF n > 0 THEN
    RAISE EXCEPTION 'Migration 0002 stopped: % pair(s) of overlapping active bookings exist for the same room. Cancel or move one booking of each pair, then run the migration again. Nothing was changed.', n;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (
    "room_id" WITH =,
    tstzrange("check_in_date", "check_out_date", '[)') WITH &&
  )
  WHERE ("status" IN ('pending', 'confirmed', 'checked_in'));

-- AlterTable
ALTER TABLE "BookingItem" ADD COLUMN     "status" "BookingStatus" NOT NULL DEFAULT 'PENDING';

-- The column is denormalised from the parent booking, so existing rows have to
-- inherit it rather than take the default. The DEFAULT only serves new rows.
UPDATE "BookingItem" i
SET "status" = b."status"
FROM "Booking" b
WHERE i."bookingId" = b."id";

-- Overlap prevention. Application code checks availability before writing, but
-- two customers can pass that check concurrently and both insert; only the
-- database can settle that race. btree_gist is what lets a GiST index mix the
-- equality operator on "staffId" with the overlap operator on the time range.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Prisma maps DateTime to timestamp(3) without a time zone, so tsrange (not
-- tstzrange) is the matching range type. The stored values are UTC instants.
--
-- '[)' — half-open, so an appointment ending at 12:00 does not collide with one
-- starting at 12:00.
--
-- The WHERE clause makes the constraint partial: only PENDING and CONFIRMED
-- items reserve a staff member. A CANCELLED or NO_SHOW visit releases its slot,
-- and COMPLETED history never blocks future bookings. This is why "status" had
-- to be reachable from this row at all.
ALTER TABLE "BookingItem"
ADD CONSTRAINT "BookingItem_staff_no_overlap"
EXCLUDE USING gist (
    "staffId" WITH =,
    tsrange("startTime", "endTime", '[)') WITH &&
) WHERE ("status" IN ('PENDING', 'CONFIRMED'));

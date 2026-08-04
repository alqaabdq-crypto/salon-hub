// Demo-only: seeds completed bookings with reviews across all three salons, so
// the ratings shown on browse cards and map pins are real aggregates rather than
// the 0.0 every salon carried before. Idempotent — every row it makes is tagged
// with a marker note and cleared on re-run. Safe to delete; not part of the
// product. Run: npx tsx scripts/seed-sample-reviews.ts
//
// Reviews cannot live in prisma/seed.ts because `Review.bookingId` is required
// and unique: a review has to hang off a real, completed booking, and the base
// seed deliberately creates no bookings.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const MARKER = "SEED_SAMPLE_REVIEW";

/** Per salon slug: the ratings to leave behind, newest first. */
const RATINGS: Record<string, Array<{ rating: number; comment: string }>> = {
  "rose-beauty-lounge": [
    { rating: 5, comment: "Layla did exactly what I asked for. Spotless salon." },
    { rating: 5, comment: "Best colour I have had in Riyadh." },
    { rating: 4, comment: "Lovely result, but I waited about fifteen minutes." },
    { rating: 5, comment: "Booked the same evening and still got a great slot." },
  ],
  "al-fursan-barbers": [
    { rating: 5, comment: "Sharpest fade in Jeddah, and the hot towel is worth it." },
    { rating: 4, comment: "Good cut, friendly team. Parking is tight." },
    { rating: 4, comment: "Quick and clean. Will come back." },
  ],
  "glow-studio": [
    { rating: 5, comment: "The private room made all the difference." },
    { rating: 3, comment: "Facial was fine, though it started late." },
  ],
};

async function main() {
  // Clear previous sample rows. Reviews first — they reference the bookings.
  const previous = await prisma.booking.findMany({
    where: { notes: MARKER },
    select: { id: true },
  });
  const previousIds = previous.map((booking) => booking.id);

  if (previousIds.length > 0) {
    await prisma.review.deleteMany({ where: { bookingId: { in: previousIds } } });
    await prisma.bookingItem.deleteMany({ where: { bookingId: { in: previousIds } } });
    await prisma.booking.deleteMany({ where: { id: { in: previousIds } } });
    console.log(`Cleared ${previousIds.length} previous sample booking(s).`);
  }

  const reviewers = await ensureReviewers();

  for (const [slug, entries] of Object.entries(RATINGS)) {
    const salon = await prisma.salon.findUnique({ where: { slug } });
    if (!salon) {
      console.warn(`Skipping ${slug}: not found. Seed the base data first.`);
      continue;
    }

    const services = await prisma.service.findMany({
      where: { salonId: salon.id, isActive: true },
    });
    const staff = await prisma.staff.findMany({
      where: { salonId: salon.id, isActive: true },
    });

    if (services.length === 0 || staff.length === 0) {
      console.warn(`Skipping ${slug}: no active services or staff.`);
      continue;
    }

    for (const [index, entry] of entries.entries()) {
      const service = services[index % services.length];
      const member = staff[index % staff.length];
      const customer = reviewers[index % reviewers.length];

      // Well in the past and COMPLETED: a review belongs to a visit that has
      // already happened, and a past booking reserves no future slot.
      const start = new Date();
      start.setDate(start.getDate() - (14 + index * 21));
      start.setHours(11, 0, 0, 0);
      const end = new Date(start.getTime() + service.durationMinutes * 60_000);

      const booking = await prisma.booking.create({
        data: {
          customerId: customer.id,
          salonId: salon.id,
          status: "COMPLETED",
          startTime: start,
          endTime: end,
          totalPrice: service.price,
          notes: MARKER,
          items: {
            create: {
              serviceId: service.id,
              staffId: member.id,
              // Ordering within the visit; unique per booking. One item here.
              position: 0,
              // BookingItem.status is denormalised from the booking and is what
              // the EXCLUDE constraint reads. COMPLETED is non-blocking, so
              // these never reserve a staff member.
              status: "COMPLETED",
              startTime: start,
              endTime: end,
              price: service.price,
              durationMinutes: service.durationMinutes,
            },
          },
        },
      });

      await prisma.review.create({
        data: {
          bookingId: booking.id,
          customerId: customer.id,
          salonId: salon.id,
          rating: entry.rating,
          comment: entry.comment,
          createdAt: start,
        },
      });
    }

    // Recompute through the same function the app uses, rather than writing the
    // aggregate by hand here — if that function is wrong, this should be wrong
    // in exactly the same way and the bug shows up immediately.
    const { recomputeSalonRating } = await import("../src/server/salon/rating");
    const result = await recomputeSalonRating(salon.id, prisma);

    console.log(
      `${salon.nameEn}: ${entries.length} review(s), avg ${result.avgRating.toFixed(2)}`,
    );
  }
}

/** Three demo customers, looked up by email so a re-run reuses them. */
async function ensureReviewers() {
  const people = [
    { email: "reviewer.one@salonhub.sa", name: "Maha S." },
    { email: "reviewer.two@salonhub.sa", name: "Abdullah K." },
    { email: "reviewer.three@salonhub.sa", name: "Reem A." },
  ];

  return Promise.all(
    people.map((person) =>
      prisma.user.upsert({
        where: { email: person.email },
        update: {},
        create: { ...person, role: "CUSTOMER" },
      }),
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

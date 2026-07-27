// Demo-only: seeds a handful of completed, paid bookings for the Rose salon so
// the owner Revenue tab shows real figures instead of the empty state. Idempotent
// — every row it makes is tagged with a marker note and cleared on re-run. Safe to
// delete; not part of the product. Run: npx tsx scripts/seed-sample-revenue.ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const MARKER = "SEED_SAMPLE_REVENUE";
const COMMISSION = 0.15; // platform default
const round2 = (n: number) => Math.round(n * 100) / 100;

async function main() {
  const salon = await prisma.salon.findFirst({ where: { nameEn: { contains: "Rose" } } });
  if (!salon) throw new Error("Rose salon not found — seed the base data first.");

  const services = await prisma.service.findMany({
    where: { salonId: salon.id, isActive: true },
    orderBy: { price: "asc" },
  });
  const staff = await prisma.staff.findMany({ where: { salonId: salon.id, isActive: true } });
  if (services.length === 0 || staff.length === 0) {
    throw new Error("Rose salon has no active services or staff.");
  }

  let customers = await prisma.user.findMany({ where: { role: "CUSTOMER" }, take: 3 });
  if (customers.length === 0) {
    const demo = await prisma.user.create({
      data: { email: "demo.customer@salonhub.sa", name: "Demo Customer", role: "CUSTOMER" },
    });
    customers = [demo];
  }

  // Clear any previous sample rows (payments + items + bookings) for a clean re-run.
  const old = await prisma.booking.findMany({ where: { notes: MARKER }, select: { id: true } });
  const oldIds = old.map((b) => b.id);
  if (oldIds.length) {
    await prisma.payment.deleteMany({ where: { bookingId: { in: oldIds } } });
    await prisma.bookingItem.deleteMany({ where: { bookingId: { in: oldIds } } });
    await prisma.booking.deleteMany({ where: { id: { in: oldIds } } });
    console.log(`Cleared ${oldIds.length} previous sample booking(s).`);
  }

  // 6 paid + 1 refunded, spread across the last few weeks.
  const plan = [
    { daysAgo: 3, status: "SUCCEEDED" as const },
    { daysAgo: 5, status: "SUCCEEDED" as const },
    { daysAgo: 8, status: "SUCCEEDED" as const },
    { daysAgo: 12, status: "SUCCEEDED" as const },
    { daysAgo: 15, status: "SUCCEEDED" as const },
    { daysAgo: 20, status: "SUCCEEDED" as const },
    { daysAgo: 10, status: "REFUNDED" as const },
  ];

  let net = 0, gross = 0, fees = 0, paid = 0;

  for (const [i, p] of plan.entries()) {
    const service = services[i % services.length];
    const member = staff[i % staff.length];
    const customer = customers[i % customers.length];
    const refunded = p.status === "REFUNDED";

    const start = new Date();
    start.setDate(start.getDate() - p.daysAgo);
    start.setHours(14, 0, 0, 0);
    const end = new Date(start.getTime() + service.durationMinutes * 60_000);

    const amount = Number(service.price);
    const platformFee = round2(amount * COMMISSION);
    const salonNet = round2(amount - platformFee);

    await prisma.booking.create({
      data: {
        customerId: customer.id,
        salonId: salon.id,
        startTime: start,
        endTime: end,
        status: refunded ? "CANCELLED" : "COMPLETED",
        totalPrice: amount,
        notes: MARKER,
        items: {
          create: [
            {
              serviceId: service.id,
              staffId: member.id,
              startTime: start,
              endTime: end,
              durationMinutes: service.durationMinutes,
              price: amount,
              position: 0,
              // COMPLETED/CANCELLED are non-blocking, so the staff-overlap
              // EXCLUDE constraint never fires for this backfill.
              status: refunded ? "CANCELLED" : "COMPLETED",
            },
          ],
        },
        payment: {
          create: {
            gatewayPaymentId: `seed-rev-${i + 1}`,
            amount,
            currency: "SAR",
            status: p.status,
            platformFee,
            salonNet,
            refundedAmount: refunded ? amount : null,
          },
        },
      },
    });

    if (!refunded) {
      net += salonNet;
      gross += amount;
      fees += platformFee;
      paid += 1;
    }
  }

  console.log(
    `Seeded ${plan.length} bookings for "${salon.nameEn}". Revenue tiles => ` +
      `net ${round2(net)}, gross ${round2(gross)}, fees ${round2(fees)}, paid ${paid}.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().finally(() => process.exit(1));
  });

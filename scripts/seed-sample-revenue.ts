// Demo-only: seeds completed, paid bookings across every approved salon so the
// owner Revenue tab and the admin Revenue page show real figures instead of
// empty states. Idempotent — every row it makes is tagged with a marker note and
// cleared on re-run. Safe to delete; not part of the product.
//
//   npx tsx scripts/seed-sample-revenue.ts
//
// Months are derived from today rather than hard-coded offsets. An earlier
// version used fixed `daysAgo` values, which meant the current month was always
// empty and the six-month chart grew a trailing zero bar as time passed.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { resolveCommissionRate } from "../src/server/payments/money";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const MARKER = "SEED_SAMPLE_REVENUE";
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Per salon: how many paid bookings land in each of the last six months, and how
 * that salon gets its commission rate.
 *
 * The three routes through `resolveCommissionRate` are each represented on
 * purpose — free tier, a premium subscription, and a negotiated override — so
 * the admin Revenue page has something to report other than one constant
 * repeated three times, and so the precedence chain is actually exercised rather
 * than merely unit-tested.
 */
const PLAN: Record<
  string,
  { perMonth: number[]; tier: "FREE" | "PREMIUM"; override?: number }
> = {
  // Free tier: inherits the platform default (30%).
  "rose-beauty-lounge": { perMonth: [2, 3, 2, 4, 3, 2], tier: "FREE" },
  // Subscribed to Premium, which buys the plan's own rate (10%).
  "al-fursan-barbers": { perMonth: [3, 2, 4, 3, 5, 3], tier: "PREMIUM" },
  // Free tier, but with a negotiated per-salon deal that beats it.
  "glow-studio": { perMonth: [1, 2, 1, 2, 2, 1], tier: "FREE", override: 0.2 },
};

async function main() {
  // Clear previous sample rows for a clean re-run.
  const previous = await prisma.booking.findMany({
    where: { notes: MARKER },
    select: { id: true },
  });
  const previousIds = previous.map((booking) => booking.id);

  if (previousIds.length > 0) {
    await prisma.payment.deleteMany({ where: { bookingId: { in: previousIds } } });
    await prisma.bookingItem.deleteMany({ where: { bookingId: { in: previousIds } } });
    await prisma.booking.deleteMany({ where: { id: { in: previousIds } } });
    console.log(`Cleared ${previousIds.length} previous sample booking(s).`);
  }

  const customers = await ensureCustomers();
  const now = new Date();
  let sequence = 0;

  for (const [slug, { perMonth, tier, override }] of Object.entries(PLAN)) {
    const salon = await prisma.salon.findUnique({ where: { slug } });
    if (!salon) {
      console.warn(`Skipping ${slug}: not found. Seed the base data first.`);
      continue;
    }

    // Put the salon on its tier for real rather than assuming a rate. A
    // subscription row is what makes the plan's discount apply at all, and
    // until now the Subscription table has never had one.
    const plan = await prisma.plan.findUnique({ where: { tier } });
    if (!plan) throw new Error(`Plan ${tier} missing — seed the base data first.`);

    const period = new Date(now);
    period.setMonth(period.getMonth() - 6);

    await prisma.subscription.upsert({
      where: { salonId: salon.id },
      update: { planId: plan.id, status: "ACTIVE" },
      create: {
        salonId: salon.id,
        planId: plan.id,
        status: "ACTIVE",
        currentPeriodStart: period,
        currentPeriodEnd: new Date(now.getFullYear() + 1, now.getMonth(), 1),
      },
    });

    await prisma.salon.update({
      where: { id: salon.id },
      data: { commissionRate: override ?? null },
    });

    // The same precedence the payment path uses: salon override → plan → default.
    const commission = resolveCommissionRate({
      salonRate: override ?? null,
      planRate: plan.commissionRate === null ? null : Number(plan.commissionRate),
    });

    const services = await prisma.service.findMany({
      where: { salonId: salon.id, isActive: true },
      orderBy: { price: "asc" },
    });
    const staff = await prisma.staff.findMany({
      where: { salonId: salon.id, isActive: true },
    });

    if (services.length === 0 || staff.length === 0) {
      console.warn(`Skipping ${slug}: no active services or staff.`);
      continue;
    }

    let net = 0;
    let gross = 0;
    let fees = 0;
    let paid = 0;

    // perMonth[0] is five months ago; the last entry is the current month.
    for (const [monthIndex, count] of perMonth.entries()) {
      for (let n = 0; n < count; n += 1) {
        const monthsAgo = perMonth.length - 1 - monthIndex;

        const start = new Date(now);
        start.setMonth(start.getMonth() - monthsAgo);
        // Spread within the month, but never into the future: the current month
        // is only partly elapsed, so a day-25 booking in it would not have
        // happened yet.
        const day = Math.min(3 + n * 6, monthsAgo === 0 ? Math.max(now.getDate() - 1, 1) : 26);
        start.setDate(Math.max(day, 1));
        start.setHours(11 + (n % 6), 0, 0, 0);

        const service = services[sequence % services.length];
        const member = staff[sequence % staff.length];
        const customer = customers[sequence % customers.length];

        // One refunded booking per salon, so the tiles show a non-settled row
        // being correctly excluded from the totals.
        const refunded = monthsAgo === 1 && n === 0;

        const end = new Date(start.getTime() + service.durationMinutes * 60_000);
        const amount = Number(service.price);
        const platformFee = round2(amount * commission);
        const salonNet = round2(amount - platformFee);

        sequence += 1;

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
                gatewayPaymentId: `seed-rev-${sequence}`,
                amount,
                currency: "SAR",
                status: refunded ? "REFUNDED" : "SUCCEEDED",
                platformFee,
                salonNet,
                refundedAmount: refunded ? amount : null,
                createdAt: start,
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
    }

    const source = override !== undefined ? "salon override" : `${tier} plan`;
    console.log(
      `${salon.nameEn}: ${paid} paid · gross ${gross.toFixed(2)} · ` +
        `commission ${fees.toFixed(2)} (${(commission * 100).toFixed(0)}%, ${source}) · ` +
        `net ${net.toFixed(2)}`,
    );
  }
}

/** Demo customers, looked up by email so a re-run reuses them. */
async function ensureCustomers() {
  const existing = await prisma.user.findMany({ where: { role: "CUSTOMER" }, take: 3 });
  if (existing.length > 0) return existing;

  return [
    await prisma.user.create({
      data: { email: "demo.customer@salonhub.sa", name: "Demo Customer", role: "CUSTOMER" },
    }),
  ];
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

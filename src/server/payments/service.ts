import { prisma } from "@/server/db/prisma";
import { setBookingStatus } from "@/server/booking/status";
import {
  halalasToSar,
  resolveCommissionRate,
  sarToHalalas,
  splitCommission,
} from "@/server/payments/money";
import {
  isFailedStatus,
  isPaidStatus,
  isPaymentConfigured,
  refundPayment,
  type MoyasarPayment,
} from "@/server/payments/moyasar";

/**
 * How long an unpaid booking may hold its slot.
 *
 * Without this a `PENDING` booking reserves staff for ever at no cost — one
 * account could freeze a salon's whole calendar. Twenty minutes is long enough
 * to finish a card payment and short enough that an abandoned checkout does not
 * cost the salon its evening.
 */
export const HOLD_MINUTES = 20;

/**
 * Releases holds that were never paid for.
 *
 * Deliberately a real cancellation rather than a filter in the availability
 * query: the slot is reserved by the *database* (the partial EXCLUDE constraint
 * on BookingItem), which knows nothing about wall-clock expiry. Only flipping
 * the status actually frees the slot for the next customer.
 *
 * Called from the availability path so the system heals itself on use, with no
 * cron to deploy or forget. It is one indexed query on a page that already runs
 * several. If payments are not configured nothing can ever be paid, so nothing
 * is expired — otherwise an unconfigured deployment would cancel every booking
 * it took.
 */
export async function expireStaleHolds(salonId?: string): Promise<void> {
  if (!isPaymentConfigured()) return;

  const cutoff = new Date(Date.now() - HOLD_MINUTES * 60_000);

  const stale = await prisma.booking.findMany({
    where: {
      status: "PENDING",
      createdAt: { lt: cutoff },
      ...(salonId ? { salonId } : {}),
      // A booking whose payment succeeded is not a stale hold, whatever its
      // booking status happens to be at this instant.
      OR: [{ payment: null }, { payment: { status: { in: ["PENDING", "FAILED"] } } }],
    },
    select: { id: true },
  });

  for (const booking of stale) {
    await setBookingStatus(booking.id, "CANCELLED");
  }
}

/** The Payment row for a booking, created on first use. */
export async function ensurePayment(bookingId: string) {
  const existing = await prisma.payment.findUnique({ where: { bookingId } });
  if (existing) return existing;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { totalPrice: true },
  });

  if (!booking) return null;

  return prisma.payment.create({
    data: { bookingId, amount: booking.totalPrice, status: "PENDING" },
  });
}

/**
 * Applies a gateway payment to our records. Safe to call repeatedly — webhooks
 * are delivered more than once, and the customer's return redirect races them.
 *
 * The commission split is resolved **here, at capture time**, and never
 * recomputed: a later change to a salon's rate must not retroactively alter what
 * it is owed for work already paid for.
 */
export async function settleFromGateway(
  gateway: MoyasarPayment,
): Promise<{ settled: boolean; bookingId?: string }> {
  const bookingId = gateway.metadata?.booking_id;
  if (!bookingId) return { settled: false };

  const payment = await prisma.payment.findUnique({
    where: { bookingId },
    include: {
      booking: {
        select: {
          id: true,
          status: true,
          salon: {
            select: {
              commissionRate: true,
              subscription: {
                select: {
                  status: true,
                  plan: { select: { commissionRate: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!payment) return { settled: false };

  if (isPaidStatus(gateway.status)) {
    // Already settled: keep the fee that was agreed at capture.
    if (payment.status !== "SUCCEEDED") {
      const salon = payment.booking.salon;
      // Only a live subscription buys its plan's reduced rate; a lapsed one
      // falls back to the platform default like anyone else.
      const planRate =
        salon.subscription?.status === "ACTIVE"
          ? Number(salon.subscription.plan.commissionRate ?? Number.NaN)
          : Number.NaN;

      const rate = resolveCommissionRate({
        salonRate: salon.commissionRate === null ? null : Number(salon.commissionRate),
        planRate: Number.isNaN(planRate) ? null : planRate,
      });

      const { platformFee, salonNet } = splitCommission(gateway.amount, rate);

      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "SUCCEEDED",
          gatewayPaymentId: gateway.id,
          gatewayInvoiceId: gateway.invoice_id ?? undefined,
          platformFee: halalasToSar(platformFee),
          salonNet: halalasToSar(salonNet),
        },
      });
    }

    // Paying confirms the visit. The transition table refuses this if the
    // booking has moved on (cancelled, or already confirmed), which is exactly
    // the idempotency we want from a repeated webhook.
    await setBookingStatus(payment.booking.id, "CONFIRMED");

    return { settled: true, bookingId };
  }

  if (isFailedStatus(gateway.status) && payment.status === "PENDING") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", gatewayPaymentId: gateway.id },
    });
  }

  return { settled: false, bookingId };
}

/**
 * Refunds a cancelled booking, if it was paid for.
 *
 * Best effort by necessity: the cancellation has already happened locally and
 * the slot is already free. A gateway that refuses the refund leaves money with
 * the platform that belongs to the customer, so the failure is returned rather
 * than swallowed — the caller surfaces it, and it needs a human.
 */
export async function refundIfPaid(
  bookingId: string,
): Promise<{ refunded: boolean; error?: string }> {
  const payment = await prisma.payment.findUnique({ where: { bookingId } });

  if (!payment || payment.status !== "SUCCEEDED" || !payment.gatewayPaymentId) {
    return { refunded: false };
  }

  const result = await refundPayment(
    payment.gatewayPaymentId,
    sarToHalalas(payment.amount.toString()),
  );

  if (!result.ok) return { refunded: false, error: result.error };

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "REFUNDED", refundedAmount: payment.amount },
  });

  return { refunded: true };
}

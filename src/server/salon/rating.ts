import { prisma } from "@/server/db/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Recomputes `Salon.avgRating` and `Salon.reviewCount` from the `Review` rows.
 *
 * Both columns are denormalised so browse can sort by rating without a join or a
 * correlated subquery. Denormalised means something has to maintain them, and
 * until now nothing did — every salon read 0.0 regardless of its reviews. This
 * is that something: call it after any write to a `Review`.
 *
 * Recomputing the aggregate rather than nudging a running average is deliberate.
 * An incremental update drifts once a review is edited or deleted, and there is
 * no cheap way to detect the drift; a full recount over one salon's reviews is a
 * single indexed aggregate (`Review` is indexed on `salonId`).
 *
 * Accepts an optional transaction client so it can run inside the same
 * transaction as the review write and never observe a half-applied state.
 */
export async function recomputeSalonRating(
  salonId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<{ avgRating: number; reviewCount: number }> {
  const aggregate = await client.review.aggregate({
    where: { salonId },
    _avg: { rating: true },
    _count: { _all: true },
  });

  const reviewCount = aggregate._count._all;
  // No reviews leaves the average at 0, which is what the column defaults to and
  // what the UI reads as "not rated yet" — distinct from a genuine low score,
  // because reviewCount is what the UI actually branches on.
  const avgRating = reviewCount === 0 ? 0 : Number(aggregate._avg.rating ?? 0);

  await client.salon.update({
    where: { id: salonId },
    data: { avgRating, reviewCount },
  });

  return { avgRating, reviewCount };
}

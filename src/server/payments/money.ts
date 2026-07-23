// Money arithmetic for payments, in integer halalas throughout.
//
// A halala is 1/100 SAR, and it is what Moyasar's API expects, so integers are
// both the exact representation and the wire format. Nothing here touches
// floating point beyond the single conversion in and out, which is why the
// commission split can be reasoned about at all: fee + net is *always* the
// amount charged, with no lost or invented halalas.

/** The cut the platform takes when neither the salon nor its plan overrides it. */
export const DEFAULT_PLATFORM_COMMISSION = 0.15;

/** "150.00" or 150 → 15000. Rounds, so a stray third decimal cannot slip through. */
export function sarToHalalas(sar: string | number): number {
  return Math.round(Number(sar) * 100);
}

/** 15000 → "150.00", the DECIMAL(10,2) form the database stores. */
export function halalasToSar(halalas: number): string {
  return (halalas / 100).toFixed(2);
}

/**
 * Commission precedence: **salon override → plan rate → platform default.**
 *
 * A negotiated per-salon rate beats everything, then whatever the salon's
 * subscription tier buys, then the house rate. Nulls fall through; a rate of
 * zero does not, since "this salon pays no commission" is a real deal.
 */
export function resolveCommissionRate({
  salonRate,
  planRate,
  platformRate = DEFAULT_PLATFORM_COMMISSION,
}: {
  salonRate?: number | null;
  planRate?: number | null;
  platformRate?: number;
}): number {
  const rate = salonRate ?? planRate ?? platformRate;

  // Guards against a bad row rather than trusting the database: a negative rate
  // would pay the salon more than the customer paid, and one above 1 would take
  // more than exists.
  if (!Number.isFinite(rate) || rate < 0) return 0;
  return Math.min(rate, 1);
}

/**
 * Splits a captured amount into the platform's fee and the salon's net.
 *
 * The fee is rounded and the net is the remainder, never rounded independently —
 * that is what guarantees the two add back to the amount exactly.
 */
export function splitCommission(
  amountHalalas: number,
  rate: number,
): { platformFee: number; salonNet: number } {
  const platformFee = Math.round(amountHalalas * rate);
  return { platformFee, salonNet: amountHalalas - platformFee };
}

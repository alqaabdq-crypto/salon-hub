import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { settleFromGateway } from "@/server/payments/service";
import type { MoyasarPayment } from "@/server/payments/moyasar";

/**
 * Moyasar's webhook.
 *
 * This is the authoritative path for money moving — the customer's browser
 * redirect is a convenience that may never arrive (they close the tab, their
 * connection drops, the gateway retries out of order). Everything here must
 * therefore be safe to run repeatedly and in any order; `settleFromGateway` is
 * written to be exactly that.
 *
 * Excluded from the locale proxy by its matcher (`/api` is not rewritten), so
 * the URL Moyasar is configured with never gains a locale prefix.
 */

type WebhookBody = {
  type?: string;
  secret_token?: string;
  data?: MoyasarPayment;
};

/**
 * Moyasar authenticates its webhooks with a shared secret in the body rather
 * than an HMAC over it, so this is a constant-time equality check and nothing
 * more. Length is compared first because timingSafeEqual throws on a mismatch.
 */
function isAuthentic(token: string | undefined): boolean {
  const expected = process.env.MOYASAR_WEBHOOK_SECRET;

  // An unset secret must reject everything. Accepting unauthenticated callbacks
  // would let anyone mark any booking paid.
  if (!expected || !token) return false;

  const a = Buffer.from(token);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  let body: WebhookBody;

  try {
    body = (await request.json()) as WebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isAuthentic(body.secret_token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payment = body.data;
  if (!payment?.id) {
    return NextResponse.json({ error: "No payment in body" }, { status: 400 });
  }

  const result = await settleFromGateway(payment);

  // 200 even when the payment matched nothing of ours: a non-2xx makes Moyasar
  // retry, and retrying will not make an unknown booking id become known. The
  // body says what happened for anyone reading delivery logs.
  return NextResponse.json({
    received: true,
    settled: result.settled,
    bookingId: result.bookingId ?? null,
  });
}

// Moyasar is the gateway because it is SAMA-licensed and settles in SAR, with
// Mada, Visa/Mastercard, Apple Pay and STC Pay. Stripe was rejected: the
// requirement is a gateway authorised in Saudi Arabia.
//
// This uses the **hosted Invoice** flow rather than the tokenised card API. The
// customer is sent to a Moyasar-hosted page, so no card data ever reaches this
// server (nothing here falls in PCI scope) and the whole flow keeps working
// without client-side JavaScript — the same constraint the booking flow holds to.

const API = "https://api.moyasar.com/v1";

export type MoyasarInvoice = {
  id: string;
  status: string;
  amount: number;
  url: string;
};

export type MoyasarPayment = {
  id: string;
  status: string;
  amount: number;
  refunded: number;
  invoice_id: string | null;
  metadata: Record<string, string> | null;
};

/**
 * Payments are optional infrastructure: without a key the app still books, it
 * just cannot charge. Every payment entry point checks this rather than
 * throwing, so a missing key degrades one feature instead of the product.
 */
export function isPaymentConfigured(): boolean {
  return Boolean(process.env.MOYASAR_SECRET_KEY);
}

function authHeader(): string {
  // Moyasar uses HTTP Basic with the secret key as the username and no password.
  const key = process.env.MOYASAR_SECRET_KEY ?? "";
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

async function call<T>(
  path: string,
  init?: { method?: string; body?: URLSearchParams },
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  if (!isPaymentConfigured()) return { ok: false, error: "not-configured" };

  try {
    const response = await fetch(`${API}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: authHeader(),
        ...(init?.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: init?.body,
      // Payment state is never cacheable, and this runs in a Server Action or
      // route handler where a stale read would be acted on as fact.
      cache: "no-store",
    });

    const text = await response.text();

    if (!response.ok) {
      // The body carries Moyasar's own message, which is what makes a failed
      // key or a rejected amount diagnosable at all.
      return { ok: false, error: `${response.status}: ${text.slice(0, 300)}` };
    }

    return { ok: true, data: JSON.parse(text) as T };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "request failed" };
  }
}

/**
 * Creates a hosted invoice and returns the URL to send the customer to.
 *
 * `amountHalalas` is the smallest unit — Moyasar rejects decimals here, and
 * every amount in this codebase is already an integer for that reason.
 */
export function createInvoice(params: {
  amountHalalas: number;
  description: string;
  callbackUrl: string;
  bookingId: string;
  /** Moyasar expires the invoice itself, so an abandoned one cannot be paid later. */
  expiresAt?: Date;
}) {
  const body = new URLSearchParams({
    amount: String(params.amountHalalas),
    currency: "SAR",
    description: params.description,
    callback_url: params.callbackUrl,
    success_url: params.callbackUrl,
    back_url: params.callbackUrl,
    // Echoed back on the payment and in the webhook, so a payment can always be
    // traced to its booking even if our own redirect never happens.
    "metadata[booking_id]": params.bookingId,
  });

  if (params.expiresAt) {
    body.set("expired_at", params.expiresAt.toISOString());
  }

  return call<MoyasarInvoice>("/invoices", { method: "POST", body });
}

/** The authoritative read. Never trust a browser redirect about whether money moved. */
export function fetchPayment(paymentId: string) {
  return call<MoyasarPayment>(`/payments/${encodeURIComponent(paymentId)}`);
}

export function fetchInvoice(invoiceId: string) {
  return call<MoyasarInvoice & { payments?: MoyasarPayment[] }>(
    `/invoices/${encodeURIComponent(invoiceId)}`,
  );
}

export function refundPayment(paymentId: string, amountHalalas?: number) {
  const body = new URLSearchParams();
  if (amountHalalas !== undefined) body.set("amount", String(amountHalalas));

  return call<MoyasarPayment>(`/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: "POST",
    body,
  });
}

/**
 * Moyasar's own status vocabulary, mapped onto ours.
 *
 * `authorized` is money held but not captured; treating it as settled would
 * credit a salon for funds that can still vanish, so it stays pending.
 */
export function isPaidStatus(status: string): boolean {
  return status === "paid" || status === "captured";
}

export function isFailedStatus(status: string): boolean {
  return status === "failed" || status === "voided" || status === "expired";
}

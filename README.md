# Salon Hub

A bilingual (English / Arabic, RTL) salon-booking marketplace for Saudi Arabia.

Customers discover and book salons; salon owners manage their listing, staff and
schedule; admins verify salons before they go live. Prices are in SAR, with
payments planned through Moyasar.

## Product decisions

These are binding for schema work. See [PROGRESS.md](./PROGRESS.md) for status.

- **Fully bilingual catalog.** Salon, service, category and staff copy all carry
  `en` + `ar` variants. Arabic is not just the app chrome — the browsable catalog
  itself is translated.
- **Multi-service bookings.** One booking holds many services (cut + colour +
  blow-dry). Price and duration are sums over `BookingItem` rows.
- **Hybrid revenue.** Commission per booking, plus a premium subscription tier
  for salons.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 ·
PostgreSQL 16 + Prisma 7 · Auth.js v5 (credentials, JWT sessions) · next-intl.

Note that Next.js 16 renamed Middleware to **Proxy** — the file is `src/proxy.ts`,
not `middleware.ts`. See `AGENTS.md`.

## Getting started

Requires Node 20+ and Docker.

```bash
# 1. Environment
cp .env.example .env          # then set AUTH_SECRET — generate with: npx auth secret

# 2. Database
docker compose up -d          # Postgres 16 on :5432

# 3. Schema and seed
npx prisma migrate dev        # apply migrations
npx prisma db seed            # creates the only admin account

# 4. Run
npm run dev                   # http://localhost:3000
```

The seed creates **`admin@salonhub.sa` / `admin1234`**. Run it — registration
deliberately refuses the `ADMIN` role, so seeding is the only way to get into
`/admin`. Change this password before any deployment.

### Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string. |
| `AUTH_SECRET` | yes | Auth.js signing secret. `NEXTAUTH_SECRET` still works as a fallback. |

**Do not set `AUTH_URL` or `NEXTAUTH_URL`.** Host trust is handled by
`trustHost: true` in `src/server/auth/config.ts`. Setting a URL makes Auth.js
rebase every request origin onto it, which sends next-intl's locale redirects to
the wrong host on any deploy whose origin differs — preview builds, staging, or a
proxy on a different port.

## Routing and roles

Locale-prefixed routes (`/en/...`, `/ar/...`) with three role-guarded sections:

| Section | Role | Notes |
| --- | --- | --- |
| `/account` | `CUSTOMER` | Bookings, cancel, pay. |
| `/owner` | `SALON_OWNER` | Salon profile, services, team, bookings. |
| `/admin` | `ADMIN` | Verification queue. Seed-only; cannot be self-registered. |

A salon owner signs up before they have a salon, so `/owner` also creates one.
New salons start `PENDING_VERIFICATION` and stay invisible to customers — not
listed, and 404 by slug — until an admin approves them. Suspending or rejecting
an approved salon cancels its pending and confirmed bookings, so nobody is left
holding an appointment at a salon they can no longer find.

Authorization is deliberately layered. `src/proxy.ts` does an optimistic JWT check
to redirect early, and every dashboard layout independently re-checks server-side
via `requireRole`. The Next.js proxy docs are explicit that proxy must not be the
only authorization layer, so **do not remove the layout checks**.

Role matching is currently strict equality — an `ADMIN` cannot view `/account` or
`/owner`.

## Booking

The booking engine lives in `src/server/booking/`:

| File | Role |
| --- | --- |
| `time.ts` | The only place Riyadh wall time and UTC instants meet. Fixed UTC+3 — Saudi Arabia has never observed DST. |
| `availability.ts` | Pure slot search. No Prisma, no clock, so it is unit-tested exhaustively. |
| `schedule.ts` | Loads staff, shifts, time off and existing bookings, then calls the engine. |
| `actions.ts` | Server Actions to create and cancel a booking. |
| `status.ts` | The only supported way to change a booking's status, and the transition table it enforces. |

Two staff members cannot be double-booked, and the guarantee is in the database,
not only in the query: a partial `btree_gist` EXCLUDE constraint on
`BookingItem (staffId, tsrange(startTime, endTime))` covering `PENDING` and
`CONFIRMED` rows. That is why `BookingItem` carries a denormalised `status` —
which makes one rule mandatory:

> **Any code path that changes `Booking.status` must change its
> `BookingItem.status` rows in the same transaction.**

Miss it and cancelled visits go on reserving staff for ever. Rather than trusting
everyone to remember, `setBookingStatus` in `status.ts` is the only supported way
to move a booking — use it instead of writing `status` directly.

An unpaid booking holds its slot for 20 minutes (`HOLD_MINUTES`) and is then
cancelled for real. A filter in the availability query would not do: the slot is
reserved by the database constraint, which knows nothing about wall-clock expiry.

The whole customer flow works without client JavaScript: selection lives in the
URL, and each slot is its own form.

## Payments

Moyasar, via the hosted **Invoice** flow — the customer is sent to a
Moyasar-hosted page, so no card data reaches this server and the flow needs no
client JavaScript. Stripe was rejected: the requirement is a gateway licensed in
Saudi Arabia.

Payments are optional infrastructure. Without `MOYASAR_SECRET_KEY` the app still
takes bookings, it just cannot charge for them — "Pay now" is hidden and holds
never expire, because nothing could ever have paid for them.

To turn it on:

1. Put `MOYASAR_SECRET_KEY` (a `sk_test_…` key while developing) in `.env`.
2. Pick a `MOYASAR_WEBHOOK_SECRET` and set the same value on the webhook in the
   Moyasar dashboard, pointing at `/api/payments/moyasar/webhook`. Unset, the
   endpoint rejects everything — without it anyone could mark any booking paid.

The webhook is the authoritative path; the customer's return redirect is a
convenience that may never arrive, and its query string is treated as
attacker-supplied (anyone can visit that URL with `status=paid`). Both re-read
the payment through the API before recording anything.

Commission precedence is **salon override → plan rate → platform default (15%)**,
resolved at capture time and never recomputed, so changing a rate later cannot
alter what a salon is owed for work already paid for.

## Testing

```bash
npm test          # vitest, unit tests over the pure booking and money modules
npm run typecheck # tsc --noEmit
npm run lint
```

### On a phone

`scripts/iphone-run.mjs` drives the running app through Playwright's WebKit build
with an iPhone device profile — iPhone viewport, DPR 3, touch input, Mobile
Safari UA. It is not the iOS Simulator, which ships with Xcode and only runs on
macOS; it is the closest stand-in that works on Windows or Linux.

```bash
npm run build && npx next start -p 3111
npx playwright install webkit
CUST_EMAIL=someone@example.test node scripts/iphone-run.mjs ./shots
```

It taps through a real booking and asserts the things only a phone shows: no
horizontal scroll in either language, Arabic laid out RTL with real glyph widths,
and touch targets that are not too small. It has already caught a header that
broke mid-phrase at 393px.

Auth and i18n bugs in this stack tend to be invisible under `next dev`, because
`NODE_ENV !== "production"` changes how Auth.js derives `trustHost`. Verify
against a real production build:

```bash
npm run build && npx next start
```

`next dev` and `next build` both write to `.next/` and will collide on Windows —
stop the dev server before building. If the project lives inside a OneDrive
folder, check `find .next -name "*DESKTOP*"` after building: any hit means
OneDrive conflict-renamed part of the build and the server will serve stale
code without erroring. See PROGRESS.md for the workaround.

## Project layout

```
prisma/            schema, migrations, seed
messages/          en.json, ar.json
src/app/[locale]/  locale-prefixed routes
src/app/api/       auth + registration handlers
src/components/    ui primitives, dashboard shell
src/i18n/          next-intl routing, request config, navigation
src/proxy.ts       optimistic auth + locale routing (Next 16 "Proxy")
src/server/        auth config, RBAC helper, Prisma client
src/server/booking availability engine, booking actions, status machine
src/server/salon   salon-owner actions
src/server/admin   verification actions
src/server/payments Moyasar client, commission maths, hold expiry
scripts/           iphone-run.mjs — drives the app on an iPhone profile
```

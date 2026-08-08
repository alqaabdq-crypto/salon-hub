# Salon Hub

A bilingual (English / Arabic, RTL) salon-booking marketplace for Saudi Arabia.

Customers discover and book salons — by city, by search, or by what is **nearest
to them on a map** — then pay in SAR through Moyasar. Salon owners manage their
listing, location, staff, photos and schedule. Admins verify salons before they go
live and answer customer support requests.

See [PROGRESS.md](./PROGRESS.md) for what is built, what is only seeded, and what
is genuinely not done — it is the status of record and more candid than this file.

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
SEED_ADMIN_PASSWORD=... SEED_OWNER_PASSWORD=... npx prisma db seed

# 4. Run
npm run dev                   # http://localhost:3000
```

The seed creates the admin account **`admin@salonhub.sa`** and three salon owners.
Run it — registration deliberately refuses the `ADMIN` role, so seeding is the
only way into `/admin`.

**Choose the passwords yourself** via `SEED_ADMIN_PASSWORD` and
`SEED_OWNER_PASSWORD`. There are development defaults in `prisma/seed.ts` for
convenience on localhost, but they are not printed here on purpose: this
repository is public, and the admin account can approve and suspend salons. The
seed **refuses to run at all** against a non-local `DATABASE_URL` unless both
variables are set, so a deployment cannot inherit them by accident.

### Optional demo data

The base seed creates salons, services and staff but no bookings. Three scripts
add demo content — all idempotent, none part of the product, all safe to delete:

```bash
npx tsx scripts/seed-sample-revenue.ts   # paid bookings, for the owner revenue tab
npx tsx scripts/seed-sample-reviews.ts   # reviews, so ratings are not all 0.0
npx tsx scripts/seed-sample-photos.ts    # placeholder avatars and salon covers
```

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
| `/salons` | anyone | Browse, search, filter, and find the nearest. |
| `/help` | anyone | Support requests. Open to guests — see Customer service. |
| `/account` | `CUSTOMER` | Bookings, cancel, pay. |
| `/owner` | `SALON_OWNER` | Salon profile, location, cover photo, services, team, bookings, revenue. |
| `/admin` | `ADMIN` | Verification queue and support queue. Seed-only; cannot be self-registered. |

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

Commission precedence is **salon override → plan rate → platform default (30%)**,
resolved at capture time and never recomputed, so changing a rate later cannot
alter what a salon is owed for work already paid for.

## Location and discovery

Salon owners drop a pin on a map in `/owner/profile`; customers press **Near me**
on `/salons` and get results ordered by distance, with a map of them.

Maps are **Leaflet + OpenStreetMap** — no API key, no billing account. Two
consequences that are not optional:

- The **OpenStreetMap attribution** rendered in the corner of every map is a
  licence condition. Do not remove it.
- Address search uses **Nominatim**, whose usage policy caps requests at roughly
  one per second. It fires on submit, never on keystroke. A production deployment
  with real traffic should self-host a geocoder or buy one; the same goes for the
  tile server.

There is **no PostGIS**. Proximity is a two-step filter: a bounding box in SQL
(served by `@@index([status, lat, lng])`) narrowed by exact Haversine in JS, which
also does the ordering. `src/lib/geo.ts` is pure and unit-tested; the trade-off is
that the distance *sort* is unindexable, which is fine at this catalogue size and
wrong for a national one.

Geolocation only ever writes `?lat=&lng=` into the URL — the search itself is
server-rendered, so a proximity result stays shareable and the back button works.

## Photos

Owners upload a **cover photo** per salon and a **photo per staff member**. Bytes
live in Postgres (`Image`) and are served by `/api/images/[id]`.

That is a deliberate trade, not an oversight: it needs no account, no keys and no
bill, and it behaves identically on a managed Postgres — where a local upload
directory would not, the filesystem being ephemeral on most hosts. The cost is
that there is no CDN and every photo sits in your backups. **At real catalogue
size this should move to object storage**; the read path is one route, which is
what keeps that migration contained.

Uploads are re-encoded rather than merely stored (`src/server/images/store.ts`):
EXIF rotation applied then **stripped** — phone photos carry GPS, and a staff photo
should not publish where it was taken — resized to fit (512px avatars, 1280px
covers), and re-encoded to WebP. The declared MIME type is treated as a claim, not
a fact: anything that fails to decode is rejected, and SVG is refused outright
since it is a document that can carry script.

## Customer service

Customers raise a support request at `/help`; admins answer it at
`/admin/support`; the customer reads the reply back on `/help`.

Tickets can be raised by **guests** — `SupportTicket.customerId` is nullable on
purpose, because the person most in need of support is often the one who cannot
sign in. Name and email are therefore always captured rather than read off the
account, and the queue flags account-less tickets.

Replying sets `ANSWERED`; closing is a separate act, because most replies invite a
follow-up. A ticket may reference a booking, but only one the sender owns.

Because the endpoint is open by design it carries a honeypot field, length limits
and a cap on open tickets per email address — all of which work with JavaScript
disabled. **None of that is real rate limiting**, and a public deployment should
add some.

> There are **no notifications** anywhere in this app, support included. A reply is
> discovered by revisiting `/help`, and a ticket by opening the queue.

## Testing

```bash
npm test          # vitest — pure modules: booking, money, geo
npm run typecheck # tsc --noEmit
npm run lint
```

68 unit tests cover the modules deliberately kept free of Prisma and the clock:
the availability engine, Riyadh/UTC conversion, halala money maths, and the
Haversine and bounding-box geometry. **Everything else — the Server Actions,
uploads, the support loop — is covered by throwaway browser scripts, not by
anything that runs in CI.** See PROGRESS.md.

### On a phone

`scripts/iphone-run.mjs` drives the running app through Playwright's WebKit build
with an iPhone device profile — iPhone viewport, DPR 3, touch input, Mobile
Safari UA. It is not the iOS Simulator, which ships with Xcode and only runs on
macOS; it is the closest stand-in that works on Windows or Linux.

```bash
npm run build && npx next start -p 3111
npx playwright install webkit chromium
CUST_EMAIL=someone@example.test node scripts/iphone-run.mjs ./shots
```

Install **chromium** as well and actually look at the pages. Several features here
shipped "structurally verified" for weeks because a WebKit version mismatch made
screenshots impossible; when that was fixed, the very first screenshot exposed two
defects that every HTTP assertion had passed straight over.

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
prisma/             schema, migrations, seed
messages/           en.json, ar.json
src/app/[locale]/   locale-prefixed routes
src/app/api/        auth, registration, Moyasar webhook, image serving
src/components/     ui primitives, dashboard shell, staff avatar
src/components/map/ Leaflet loader, location picker, salons map, near-me button
src/i18n/           next-intl routing, request config, navigation
src/lib/geo.ts      pure Haversine / bounding-box geometry
src/proxy.ts        optimistic auth + locale routing (Next 16 "Proxy")
src/server/         auth config, RBAC helper, Prisma client
src/server/booking  availability engine, booking actions, status machine
src/server/salon    salon-owner actions, proximity query, rating recompute
src/server/images   upload validation, resize/re-encode, storage
src/server/support  support ticket actions
src/server/admin    verification actions
src/server/payments Moyasar client, commission maths, hold expiry
scripts/            iphone-run.mjs, plus the optional demo seeders above
```

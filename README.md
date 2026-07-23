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
| `/account` | `CUSTOMER` | |
| `/owner` | `SALON_OWNER` | |
| `/admin` | `ADMIN` | Seed-only; cannot be self-registered. |

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

Two staff members cannot be double-booked, and the guarantee is in the database,
not only in the query: a partial `btree_gist` EXCLUDE constraint on
`BookingItem (staffId, tsrange(startTime, endTime))` covering `PENDING` and
`CONFIRMED` rows. That is why `BookingItem` carries a denormalised `status` —
which makes one rule mandatory:

> **Any code path that changes `Booking.status` must change its
> `BookingItem.status` rows in the same transaction.**

Miss it and cancelled visits go on reserving staff for ever.

The whole customer flow works without client JavaScript: selection lives in the
URL, and each slot is its own form.

## Testing

```bash
npm test          # vitest, unit tests over the pure booking modules
npm run typecheck # tsc --noEmit
npm run lint
```

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
src/server/booking availability engine and booking actions
```

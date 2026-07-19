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

## Testing auth changes

Auth and i18n bugs in this stack tend to be invisible under `next dev`, because
`NODE_ENV !== "production"` changes how Auth.js derives `trustHost`. Verify
against a real production build:

```bash
npm run build && npx next start
```

`next dev` and `next build` both write to `.next/` and will collide on Windows —
stop the dev server before building.

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
```

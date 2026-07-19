# Salon Hub — Progress Report

**Last updated:** 2026-07-19

Salon Hub is a bilingual (English / Arabic, RTL) salon-booking marketplace for
Saudi Arabia. Customers discover and book salons; salon owners manage their
listing, staff and schedule; admins verify salons before they go live.

---

## Product decisions

Confirmed 2026-07-19. Binding for schema work. All three are now implemented in
the schema (M2).

| Decision | Choice |
| --- | --- |
| Catalog content | **Fully bilingual** — salon, service, category and staff copy all carry `en` + `ar` variants. Arabic is not just app chrome. |
| Booking shape | **Multi-service** — one booking holds many services (cut + colour + blow-dry). Price and duration are sums over items. |
| Revenue model | **Hybrid** — commission per booking *and* a premium subscription tier for salons. |

---

## Milestone status

Renumbered 2026-07-19. Only two points were ever anchored in the repo: `Milestone 1`
in the M1 commit, and `M5 integrates Moyasar` in the schema. The schema work done
this session originally squatted on the M2 slot; it is now **M1.2**, so M2 means
what a roadmap would naturally expect — the customer-facing product. M5 stays
payments, as originally planned.

| Milestone | Scope | Status |
| --- | --- | --- |
| M1 | Foundation — scaffold, auth, RBAC, i18n, MVP schema | ✅ Shipped (`9d59dad`) |
| M1.1 | Review fixes — auth blocker, timezone, money, fonts, docs | ✅ Done · ⚠️ uncommitted |
| M1.2 | Schema — bilingual catalog, multi-service bookings, revenue models | ✅ Done · ⚠️ uncommitted |
| M2 | Customer marketplace — app shell, browse, search, salon detail | ✅ Done · ⚠️ uncommitted |
| M3 | Booking engine — availability, overlap prevention, booking flow | 🔴 Not started |
| M4 | Salon owner + admin dashboards | 🔴 Not started |
| M5 | Payments via Moyasar | 🔴 Not started |

**M2 breakdown** — all four parts built 2026-07-19:

1. ✅ App shell — header, nav, locale switcher (wires the previously unused `Nav` keys).
2. ✅ Seed data — plans, bilingual categories, three approved salons with services,
   staff and working hours.
3. ✅ Browse and search — filter by city, gender focus, category, plus text search.
4. ✅ Salon detail — services, team, opening hours, reviews.

### Working tree

M1.1, M1.2 and M2 are all complete and verified but **not yet committed** — three
milestones' worth of work exists only as working-tree changes on `master`:

```
 M README.md
 M messages/ar.json
 M messages/en.json
 M prisma/schema.prisma
 M prisma/seed.ts
 M src/app/[locale]/layout.tsx
 M src/app/[locale]/page.tsx
 M src/app/globals.css
 M src/components/logout-button.tsx
 M src/i18n/request.ts
 M src/server/auth/config.ts
?? PROGRESS.md
?? prisma/migrations/20260719144659_money_precision_decimal_10_2/
?? prisma/migrations/20260719145203_m2_bilingual_catalog_multiservice_bookings_revenue/
?? src/app/[locale]/salons/
?? src/components/locale-switcher.tsx
?? src/components/site-header.tsx
?? src/i18n/content.ts
```

They split cleanly into three commits along the M1.1 / M1.2 / M2 boundaries.

`.env` was also edited (`NEXTAUTH_URL` removed) but is gitignored, so **every
deployed environment needs that variable removed by hand** — the repo cannot carry
that change for you.

The two migrations are already applied to the local database. Anyone pulling these
changes runs `npx prisma migrate dev` to catch up.

---

## Completed 2026-07-19

### M1.1 — review fixes

**Auth in production (was P0).** `trustHost: true` set in
`src/server/auth/config.ts`. Auth.js derives `trustHost` from `AUTH_URL` /
`AUTH_TRUST_HOST` / `VERCEL` / `CF_PAGES` / `NODE_ENV !== "production"` — never
from `NEXTAUTH_URL`, the only variable the project set. Every auth request in a
production build returned 500 `UntrustedHost`; `next dev` hid it.

**Request-origin rewriting.** `NEXTAUTH_URL` removed from `.env` and
`.env.example`. Setting it routed requests through Auth.js's `reqWithEnvURL`,
which rebased `req.url` onto the env origin — observed sending `GET /` on port
3111 cross-origin to `http://localhost:3000/en`. `trustHost: true` covers host
trust without it. **Do not reintroduce `AUTH_URL` / `NEXTAUTH_URL`.**

**Timezone.** Pinned to `Asia/Riyadh` in `src/i18n/request.ts`. It was inferred
from the server clock, so a UTC container would have shifted every booking time
three hours. Verified by running the server under `TZ=UTC`.

**Money precision.** `DECIMAL(65,30)` → `DECIMAL(10,2)` across all money columns
(migration `20260719144659_money_precision_decimal_10_2`).

**Fonts.** `globals.css` hardcoded `font-family: Arial` on `body`, overriding the
Geist variables — the whole app rendered in Arial, and no Arabic webfont was
loaded at all. Body now uses `var(--font-sans)`, and Noto Sans Arabic is loaded
with Arabic subsetting so Arabic resolves per-glyph after Geist.

**Docs.** `README.md` replaced (was create-next-app boilerplate) with setup steps,
env-var rules, the role model, and the vision. This `PROGRESS.md` added.

### M2 — schema

Migration `20260719145203_m2_bilingual_catalog_multiservice_bookings_revenue`.

- **Bilingual catalog** — `nameEn`/`nameAr` and `descriptionEn`/`descriptionAr` on
  `Salon` and `Service`, `nameEn`/`nameAr` on `Category`, `bioEn`/`bioAr` on
  `Staff`. `slug` stays single: URL-safe Latin, shared across locales so links
  survive a language switch.
- **Multi-service bookings** — `Booking` split into `Booking` + `BookingItem`.
  Staff moved to the item, so one visit can span several people. `price` and
  `durationMinutes` are snapshotted per item, so repricing a `Service` never
  rewrites booking history. `Booking.startTime`/`endTime` are the denormalised
  envelope over items.
- **Revenue** — `Salon.commissionRate` (negotiated override), `Payment.platformFee`
  / `salonNet` (split resolved at capture time), `Payout` (period settlement
  linking the payments it covers), and `Plan` + `Subscription` for the premium
  tier. Commission precedence: **salon override → plan rate → platform default.**

Verified with a rolled-back transaction exercising a two-service, two-staff
booking with a 10% premium-plan commission split: item prices summed to the
booking total, Arabic fields round-tripped, payout linked to its payment.

### M2 — customer marketplace

Routes added: `/[locale]/salons` (browse) and `/[locale]/salons/[slug]` (detail).

- **App shell.** `SiteHeader` with brand, salons link, locale switcher and
  auth-aware actions (Log in / Sign up when signed out, Dashboard / Log out when
  signed in, routed by role). The locale switcher uses next-intl's locale-stripped
  `usePathname`, so switching preserves deep paths — verified
  `/en/salons/rose-beauty-lounge` ↔ `/ar/salons/rose-beauty-lounge`.
- **Bilingual content helper.** `src/i18n/content.ts` — `localized(row, "name", locale)`
  resolves the paired `nameEn`/`nameAr` columns with English fallback.
- **Filters** are a plain GET form: no client JS, and filter state stays shareable
  in the URL.
- **Approval gating** is enforced in both queries. A non-`APPROVED` salon 404s on
  its detail page and disappears from browse — verified by flipping a seeded salon
  to `PENDING_VERIFICATION` and back.
- **Prices** format per-locale through next-intl: `SAR 150` / `150 ر.س.‏`.
  Arabic plurals use full ICU categories (`صالون واحد` for one, not `1 صالون`).

**Trade-off taken:** `SiteHeader` calls `auth()`, so every route is now
server-rendered on demand (`ƒ`) rather than prerendered. The header is
account-aware on every page, and with the JWT strategy this is cookie verification
rather than a database round-trip. Revisit only if public catalog pages need CDN
caching — that would mean moving the auth-dependent part to a client component.

Seed now creates FREE/PREMIUM plans, five bilingual categories, and three approved
salons (Riyadh / Jeddah / Dammam, covering all three `GenderFocus` values) with
services, staff, and Saturday–Thursday 10:00–22:00 hours. It is idempotent —
verified by running twice with identical counts. Salon owner logins are
`owner.rose@`, `owner.fursan@`, `owner.glow@salonhub.sa`, password `owner1234`.

---

## Open issues

### 🟠 P1

- **Prisma and bcryptjs are bundled into the proxy**, which runs on every
  request, because `src/proxy.ts` imports the full auth config. Auth.js v5's
  split-config pattern (edge-safe `auth.config.ts` + full `auth.ts`) fixes this.
  Not fatal — Next 16 proxy runs on the Node runtime — but it is per-request weight.

### 🟡 P2

- Logged-in users can still browse to `/auth/login` and `/auth/register`.
- **Browse has no pagination.** Fine for three seeded salons, wrong at scale —
  `findMany` is unbounded. Add cursor pagination before real listings land.
- **Text search is `contains`**, so it cannot match across `nameEn`/`nameAr` word
  order or handle Arabic diacritics and alef variants (`أ` vs `ا`). Postgres full-text
  search with an Arabic configuration is the real answer.
- Salon cover images and photos are modelled (`coverImageUrl`, `SalonPhoto`) but
  nothing renders them yet — cards and detail pages are text-only.
- Role matching is strict equality, so an `ADMIN` cannot view `/account` or
  `/owner`. Fine if deliberate, awkward for support work.
- **No tests**, heading into a booking engine with overlap logic and money.

### 🔵 P3 — deferred schema decisions

- **Overlap prevention.** The `btree_gist` EXCLUDE constraint belongs on
  `BookingItem` (staff + time range), not `Booking`. Still deferred to M3, and it
  has a wrinkle: it must be *partial* so `CANCELLED` visits stop blocking slots,
  which means `status` has to be reachable from the item row. Decide between
  denormalising status onto `BookingItem` or enforcing it in the availability
  engine before writing that migration.
- Working hours exist only on `Staff`, never on `Salon`; availability needs both.
  The salon detail page currently works around this by showing the **union** of
  staff hours — the widest window anyone is available. That is a display
  approximation, not opening hours, and it will diverge from reality the moment a
  salon's posted hours differ from its team's shifts.
- `Staff` has no gender field despite `GenderFocus` on salons — likely required
  for women's salons in this market.
- `lat` / `lng` unindexed and `city` is free text — "salons near me" will not scale.
  No PostGIS.
- No notifications model (SMS / WhatsApp reminders are near-mandatory here).
- No OAuth adapter tables, despite `User.image` / `emailVerified` hinting that way.
- `Review.rating` has no 1–5 constraint; `avgRating` / `reviewCount` are
  denormalised with nothing maintaining them.
- `updatedAt` exists only on `Booking`, `Payment`, `Payout` and `Subscription`.
- Salon tier is derived through `Subscription` rather than denormalised onto
  `Salon`; revisit if search ranking needs to filter on it cheaply.

---

## Environment notes

- **Building inside OneDrive causes intermittent `EPERM` on `.next`.** OneDrive
  holds file handles while syncing. `rm -rf .next` and rebuild, or exclude
  `.next` from sync — or move the project outside the synced folder.
- `next dev` and `next build` both write to `.next/` and collide. Stop the dev
  server before building.
- Auth and i18n bugs here are invisible under `next dev`. Verify with
  `npm run build && npx next start`.

## Suggested next steps

1. **First tests, before M3 rather than after.** The booking engine is where
   overlap logic and money meet; it is the wrong place to still have zero coverage.
2. **M3 booking engine.** Start with the overlap-constraint decision above
   (denormalise `status` onto `BookingItem`, or enforce in the engine), since it
   shapes the availability query.
3. Split the auth config so the proxy stops bundling Prisma.
4. Pagination on browse, before the catalog grows past a screenful.

# Salon Hub — Progress Report

**Last updated:** 2026-07-27

Salon Hub is a bilingual (English / Arabic, RTL) salon-booking marketplace for
Saudi Arabia. Customers discover and book salons; salon owners manage their
listing, staff and schedule; admins verify salons before they go live.

---

## ▶ Last request and answer

> **Read this first when reviewing this report, and lead with it.** Standing
> instruction from the project owner: begin a review by stating what was last
> asked for and what the answer was, before anything else.

**Asked (2026-07-27, latest):** *"another option in the owner dashboard for
revenue."*

**Answered:** Added an **Owner → Revenue** tab (`/owner/revenue`). Reads the salon's
`Payment` rows (joined via the booking) and shows four tiles — **your earnings**
(Σ `salonNet` of SUCCEEDED), **gross processed** (`amount`), **platform fees**
(`platformFee`), and **paid-bookings** count — plus an *awaiting payout* pill (net
not yet linked to a `Payout`) and a recent-payments list. All money summed with
`Prisma.Decimal`, so no float drift. New `navRevenue` link in the owner layout and
`rev*` keys in the `Owner` namespace (en/ar, 80 keys each, sets identical).
Verified **authed** as `owner.rose` (logged in through the credentials flow): the
tab, tiles and nav link all render. A **demo seeder** (`scripts/seed-sample-revenue.ts`
— idempotent, tags rows with a marker note, looks records up by name/email) was
added and run: 6 paid + 1 refunded booking for the Rose salon, so the tiles now
show **net SAR 986 / gross 1,160 / fees 174 / 6 paid** with a refunded row in the
list. Demo-only data (not in git); the seeder is safe to re-run or delete.
Committed + pushed to the public repo.

---

**Asked (2026-07-27):** *"add a feature to add reviews for the website and
make it in the bottom of the website."*

**Answered:** Added a **website-testimonials** feature at the bottom of the landing
page — reviews *about Salon Hub itself*, which is **distinct from the still-unbuilt
per-salon review writing** (see "What is genuinely not done"). New `SiteReview`
model + migration `20260727162818_site_reviews` (name, rating 1–5, comment,
createdAt). Server action `createSiteReview` (`src/server/site-review/actions.ts`)
— zod-validated, **open submission (no login)**, redirects `/?review=ok|error#reviews`.
Server component `site-reviews.tsx`: a no-JS Server-Action form (name, star rating,
comment) plus gold-star review cards in dark glass, wired into the landing bottom
via `<SiteReviews>`. Bilingual `SiteReviews` namespace in en/ar (ICU plurals for
star counts). Verified end-to-end locally: a submitted review 303-redirects,
persists, and renders; error/empty states and the Arabic section all render; no
MISSING_MESSAGE. Committed + pushed to the public repo. ⚠️ Open submission is
spam-exposed (length caps only); one test review ("Sara A.") sits in the DB as a
visible example — delete it or gate the form behind `auth()` on request.

---

**Asked (2026-07-27):** *"link my existing GitHub repo and publish the whole
project publicly"* (after running `gh auth login` in their own terminal).

**Answered:** Done. Authenticated as **`alqaabdq-crypto`**, linked the existing
`salon-hub` repo as `origin`, and pushed the full history `master → main`. The
remote held only a placeholder *"Initial commit"* (`.gitattributes`), replaced via
`--force-with-lease` — nothing of value lost. Flipped the repo **private → public**.
Now live: **https://github.com/alqaabdq-crypto/salon-hub** (default branch `main`,
15 commits). Local `master` tracks `origin/main`, so future publishes are a plain
`git push` — no more auth setup.
⚠️ The public `README.md` still documents the demo passwords (`admin1234` /
`owner1234`), visible to anyone. Offered to scrub them — **not yet done.**

**Design shipped this session (all committed, all live on the tunnel):**
- **RedSun dark redesign** (from a Pinterest reference) — forced dark theme
  (`@custom-variant dark` + `.dark` on `<html>`, safe as every page is dark-aware),
  near-black surfaces (`--background #0a0b07`), bright olive accent
  (`--color-brand #b6d94a`), dark-text button, and a glowing rising-sun arc
  (`.sun-disc`/`.sun-wrap`). Centred hero: pill → white headline → dual CTAs → sun →
  floating glass app bar, with sun + bar parallaxing to the cursor. Dark contrast
  ≥ 7:1. ⚠️ **Never screenshot-verified** (Playwright/WebKit version mismatch) — the
  sun-glow may want visual tuning.
- **3D / interactive layer** — `.scene` / `.glass` / `.shadow-depth` / `.card-3d`,
  floating orbs, `fade-up` entrances, all behind a `prefers-reduced-motion` guard.
  The hero is the only JS surface; the booking flow stays no-JS.
- **Colour** — olive palette (replaced an initial rose/violet "colourful" system).
  Unused `card*` keys in the `Home` namespace are harmless leftovers.

**Live tunnel (unchanged URL):** `https://pet-varies-cables-improving.trycloudflare.com`
— hard-refresh (Ctrl+Shift+R) to clear old CSS. Caveats: **dies when this laptop
sleeps**, exposes the machine + local DB, hostname changes on any relaunch.

**Still owed:** the *durable* URL (Vercel + Neon, ~15 min, blocked on `vercel login`
+ a Neon connection string). Optional follow-ups: scrub the demo passwords from the
now-public README; visually tune the sun-glow.

---

### Prior requests

- **2026-07-26:** *"colors to be white and oily green"* — token-only `globals.css`
  recolour to the current olive palette (brand `#556b1a`, accent `#7d9b2f`),
  contrast-verified. Still current.
- **2026-07-26:** *"integrate with claude design and make the url more colorful"* —
  built the token-driven brand system + utilities (`.btn-brand`,
  `.text-gradient-brand`, `.card-surface`) across every public surface. Recoloured
  since, but the structure stands.
- **2026-07-23:** *"deploy this in URL so i can browse it"* → deployment-readiness
  (fixed the gitignored-Prisma-client build blocker; guarded the seed;
  fast-forwarded `master`) plus a first Cloudflare tunnel. Durable URL still owed.

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
| M1.1 | Review fixes — auth blocker, timezone, money, fonts, docs | ✅ Shipped (`10f4a5d`) |
| M1.2 | Schema — bilingual catalog, multi-service bookings, revenue models | ✅ Shipped (`10f4a5d`) |
| M2 | Customer marketplace — app shell, browse, search, salon detail | ✅ Shipped (`b0dfd0b`) |
| M3 | Booking engine — availability, overlap prevention, booking flow | ✅ Shipped (`2b86988`) |
| M4 | Salon owner + admin dashboards | ✅ Shipped (`ee46d52`) |
| M5 | Payments via Moyasar | ✅ Shipped (`ee46d52`) — needs live keys to exercise |

**All seven original milestones are now covered.** M6 (reviews) and M7 (polish,
SEO, deploy) from the first plan were folded into the renumbering: review display
shipped with M2, review *writing* has not been built, and deployment has not been
attempted. See "What is genuinely not done" below.

**M2 breakdown** — all four parts built 2026-07-19:

1. ✅ App shell — header, nav, locale switcher (wires the previously unused `Nav` keys).
2. ✅ Seed data — plans, bilingual categories, three approved salons with services,
   staff and working hours.
3. ✅ Browse and search — filter by city, gender focus, category, plus text search.
4. ✅ Salon detail — services, team, opening hours, reviews.

### Branch

**`master` now holds everything**, fast-forwarded from `feat/m2-marketplace` on
2026-07-23 as part of getting the project deployable — a host deploys the default
branch, and that branch was still sitting on M1. Both refs point at the same
commit; `feat/m2-marketplace` is kept only as a historical label and can be
deleted.

The M1-era note below is retained because it explains the commit shape:

Two commits, not the three the milestones suggest. `prisma/schema.prisma` and
`src/app/[locale]/layout.tsx` each carry changes from more than one milestone, so
an M1.1/M1.2 split would have produced a commit that does not build. They are
squashed into `10f4a5d`; M2 is `b0dfd0b`. Both commits build standalone —
verified that `10f4a5d` has no references to files introduced later.

`.env` was also edited (`NEXTAUTH_URL` removed) but is gitignored, so **every
deployed environment needs that variable removed by hand** — the repo cannot carry
that change for you.

M3 sits on the same branch. All migrations are already applied to the local
database; anyone pulling these changes runs `npx prisma migrate dev` to catch up.
The M3 migration creates the `btree_gist` extension, which needs a role that may
create extensions — on a managed Postgres that is not always the app's own user.

---

## Completed 2026-07-23 (second session) — M4 and M5

### The invariant became a function

M3 left a rule everyone had to remember: change `Booking.status` and you must
change `BookingItem.status` with it, or cancelled visits keep reserving staff.
M4 turns that into `setBookingStatus` in `src/server/booking/status.ts`, the only
supported way to move a booking. It owns the transition table too:

| From | May become |
| --- | --- |
| `PENDING` | `CONFIRMED`, `CANCELLED` |
| `CONFIRMED` | `COMPLETED`, `NO_SHOW`, `CANCELLED` |
| terminal | nothing |

**Nothing returns to a blocking status.** Reviving a cancelled booking would ask
the database for a slot someone else has very likely taken, and the EXCLUDE
constraint would refuse it at the worst possible moment. A customer who changes
their mind books again.

### M4 — owner dashboard

`/owner` with overview, bookings, services, team and profile. A salon owner signs
up before they have a salon, so every page copes with there being nothing to
manage yet, and the profile form doubles as the create-salon form. New salons
start `PENDING_VERIFICATION` and are invisible to customers until an admin
approves them.

Staff identity, skills and shifts save in **one** form and one transaction: a
member with no services or no hours is invisible to the availability engine, so a
partial save would quietly produce someone who can never be booked.

Services are retired, never deleted — booking history snapshots the price but
still points at the row.

### M4 — admin

`/admin` is the verification queue plus a roster of every salon. Approving puts a
salon on the marketplace; suspending or rejecting takes it off **and cancels its
pending and confirmed bookings**, one at a time through `setBookingStatus`, so no
customer is left holding an appointment at a salon they can no longer find.

### M5 — payments via Moyasar

Hosted **Invoice** flow, not the tokenised card API: the customer is sent to a
Moyasar-hosted page, so no card data reaches this server and the flow still works
without client JavaScript.

- `money.ts` — all arithmetic in integer halalas, which is also Moyasar's wire
  format. The fee is rounded and the net is the remainder, so `fee + net` is
  always exactly the amount charged.
- Commission precedence is **salon override → plan rate → platform default
  (15%)**, resolved *at capture time* and never recomputed, so changing a rate
  later cannot alter what a salon is owed for work already paid for. Only an
  `ACTIVE` subscription buys its plan's rate.
- The webhook (`/api/payments/moyasar/webhook`) is the authoritative path;
  the customer's return redirect is a convenience that may never arrive. Both
  call the same idempotent `settleFromGateway`.
- The return page treats its own query string as attacker-supplied — anyone can
  visit it with `status=paid`. It re-reads the payment through the API with our
  secret key, and *that* is what gets recorded.
- Cancelling a paid booking refunds it. The slot is freed first; a gateway that
  refuses the refund surfaces an error rather than failing silently, because that
  is the case where money is still with us.

### P0 closed: unpaid holds expire

`HOLD_MINUTES = 20`. An unpaid `PENDING` booking older than that is cancelled for
real — a filter in the availability query would not have worked, because the slot
is reserved by the database constraint, which knows nothing about wall-clock
expiry. Swept from the availability path so the system heals on use with no cron
to deploy or forget, and skipped entirely when payments are unconfigured, since
an unconfigured deployment would otherwise cancel every booking it ever took.

### Verified

- 43 unit tests (11 new, over the money and commission maths — including that
  `fee + net` reconstructs the amount across awkward rounding).
- **39 end-to-end HTTP checks of the full lifecycle**: owner registers → creates
  a salon → hidden from browse and 404 by slug → admin approves → appears in
  browse → owner adds a service and a stylist with shifts → customer books at the
  brand-new salon → owner is offered Confirm but not Complete → confirms →
  webhook with the wrong secret is rejected 401 → with the right secret settles →
  split lands as `SUCCEEDED,15.00,85.00` → a redelivered webhook changes nothing
  → admin suspends → the confirmed booking *and its items* go `CANCELLED`.
- **Run on an iPhone profile in WebKit** (see below).

### Run on a phone

The iOS Simulator is macOS-only and cannot run on this machine. The closest
faithful substitute is Playwright's **WebKit** build with the iPhone 15 Pro
device profile — same engine family as Safari, 393×659 at DPR 3, touch input,
Mobile Safari UA. `scripts/iphone-run.mjs` drives it.

It completed a real booking by **tapping** a slot, and found two layout faults
that no desktop check would have:

1. The site header broke *mid-phrase* at 393px — "Salon Hub" and "Log out" each
   split across two lines. Fixed with `whitespace-nowrap` on every nav item and
   an explicitly wrapping row: wrapping the row is fine, wrapping a label is not.
2. The browse filters were a wrapping flex row, so a label could end up sitting
   above a field it did not belong to. Now a two-column grid on small screens.

Also asserted: no page scrolls horizontally in either language, Arabic lays out
RTL with real glyph widths (a missing webfont would show tofu), and no slot
button is under 32px tall.

---

## Completed 2026-07-23 (first session) — M3

### The blocking decision, settled

Overlap prevention needed `status` reachable from `BookingItem`. **Decision:
denormalise it.** `BookingItem.status` now mirrors its parent booking, which lets
the constraint live in the database:

```sql
EXCLUDE USING gist ("staffId" WITH =, tsrange("startTime", "endTime", '[)') WITH &&)
  WHERE ("status" IN ('PENDING', 'CONFIRMED'))
```

`tsrange`, not `tstzrange`, because Prisma maps `DateTime` to `timestamp(3)`
without a zone. `'[)'` so a visit ending at 12:00 does not collide with one
starting at 12:00. Partial, so a cancelled visit releases its slot and completed
history never blocks future bookings.

**The cost of the decision:** two rows now carry the same truth. Every mutation
that changes a booking's status *must* change its items' status in the same
transaction — `cancelBooking` does. The M4 owner dashboard (confirm, complete,
no-show) has to honour the same rule, or cancelled visits will go on reserving
staff. `BLOCKING_STATUSES` in `src/server/booking/schedule.ts` is the list the
constraint enforces; the two must stay in step.

The alternative — enforcing it only in the availability query — was rejected:
two customers can pass the same check concurrently and both insert.

### Availability engine

Split three ways so the logic is testable without a database:

- `src/server/booking/time.ts` — the only place Riyadh wall time and UTC instants
  meet. Fixed UTC+3: Saudi Arabia has never observed DST, so the offset is exact,
  not an approximation, and the engine stays free of the timezone database.
- `src/server/booking/availability.ts` — pure. Takes intervals in minutes past
  Riyadh midnight, gives slots out. Values outside 0–1440 are legal and load-
  bearing: a visit that started yesterday appears as a negative start and still
  blocks this morning.
- `src/server/booking/schedule.ts` — loads rows, calls the engine.

Multi-service visits run back to back, and a member committed to one service
never constrains a later one, so **no backtracking is needed** — first qualified
free member per service, in a stable order. A visit can span several people.

### Booking flow

`/[locale]/salons/[slug]/book` — services and date in the URL as a plain GET
form, then one small POST form per slot. **No client JavaScript anywhere in the
flow**; it works with JS disabled, and the basket survives a reload, a language
switch, or being shared. `/account` lists upcoming and past bookings and cancels
them.

The action recomputes availability from scratch and uses the posted start only to
pick which slot it just derived is wanted — the posted times are never written.
A slot taken between render and submit redirects back with `error=unavailable`;
one taken between the check and the insert is caught as the constraint violation
and redirects with `error=taken`.

### Tests

Vitest, `npm test`. 32 unit tests over the two pure modules — half-open interval
edges, split shifts, unqualified staff, overnight spillover, DST-free offset,
impossible dates. `npm run typecheck` added too.

### Verified

Against the seeded database and a production build:

- 15 database-level checks — the EXCLUDE constraint rejects an overlapping item
  and permits a back-to-back one; a cancelled item stops reserving its slot;
  Friday offers nothing; a past date offers nothing; today is cut off at the
  current minute.
- 17 end-to-end HTTP checks over the no-JS path — register, credentials login,
  book, appear in `/account`, cancel, Arabic RTL.
- 7 exhaustion checks — one booking at 10:00 does *not* remove the slot (the
  second stylist absorbs it), a second one does, and a stale post of the taken
  slot is refused rather than double-booked.

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

**`.env.example` had never been committed.** Found while staging `10f4a5d`:
`.gitignore`'s `.env*` pattern matched the template too, so it was absent from the
M1 commit and from every clone. The README's `cp .env.example .env` step would
have failed for anyone setting the project up fresh. Fixed by negating the pattern
(`!.env.example`) and adding the file. The real `.env` remains ignored — verified
no secret files are tracked.

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

## Deployment

**Status: ready to deploy, never deployed.** The only browsable URL so far has
been a tunnel to a laptop (see the top of this file).

### What was fixed to make deployment possible

- **The build now generates the Prisma client.** `/src/generated/prisma` is
  gitignored, so a fresh clone — which is exactly what a cloud builder starts
  from — had no client and could not compile. `build` is now
  `prisma generate && next build`. `prisma generate` needs no database
  connection, so it is safe at build time. Verified by cloning the repo to a
  clean directory, installing, and building with `DATABASE_URL` unset entirely.
- **The seed refuses to publish its own passwords.** `admin1234` / `owner1234`
  are printed in the README, and the admin account can approve and suspend
  salons. Seeding a non-local database now throws unless `SEED_ADMIN_PASSWORD`
  and `SEED_OWNER_PASSWORD` are set. The check is the host in `DATABASE_URL`,
  not `NODE_ENV` — the seed is usually run by hand, where `NODE_ENV` says
  nothing useful.
- **`master` was fast-forwarded** to the full product. A host deploys the
  default branch, and it was still on M1.

### To get a durable URL (Vercel + Neon)

Blocked on two steps only the project owner can perform; everything after them is
mechanical.

1. `vercel login` — interactive, browser-based.
2. Create a free Neon Postgres and take the connection string. Neon supports the
   `btree_gist` extension the M3 migration needs, which is the thing most likely
   to fail on a managed database.
3. Set env vars on the project: `DATABASE_URL`, `AUTH_SECRET` (`npx auth secret`),
   `SEED_ADMIN_PASSWORD`, `SEED_OWNER_PASSWORD`. **Do not set `AUTH_URL` or
   `NEXTAUTH_URL`** — see the rule in the README; it breaks locale redirects on
   any host whose origin differs.
4. `npm run db:deploy` then `npm run db:seed` against the remote URL.
5. `vercel deploy --prod`.

Migrations are deliberately *not* in the build command. `prisma migrate deploy`
during a build means every preview deployment mutates the shared database, and
the `btree_gist` extension needs a role permitted to create extensions — a
failure better seen once, run by hand, than buried in build logs.

### The tunnel, for reference

```bash
cd /c/temp/salon-hub-live && npx next start -p 3111     # production build, outside OneDrive
/c/temp/cloudflared.exe tunnel --url http://localhost:3111 --no-autoupdate
```

Quick tunnels need no Cloudflare account and mint a random `*.trycloudflare.com`
hostname per run — the URL changes every time, so it cannot be bookmarked. Auth
worked through it unmodified because `trustHost: true` is set and no `AUTH_URL`
is pinned; the login redirects came back on the tunnel hostname, not localhost.

---

## What is genuinely not done

The milestone table says shipped; this says what "shipped" does not mean.

- **Nothing has been tested against Moyasar.** Every payment path is exercised
  end to end against our own webhook handler with a seeded payment row, which
  proves the split, the idempotency and the auth check. It does not prove the
  request shape Moyasar actually accepts, because that needs `MOYASAR_SECRET_KEY`
  from a real dashboard. **Get test keys (`sk_test_…`) and run one booking
  through before believing the invoice call works.**
- **Customers cannot write reviews.** Reviews render on salon pages and the
  schema has held `Review` since M1, but nothing creates one — and `avgRating` /
  `reviewCount` are denormalised with nothing maintaining them.
- **Nothing has ever been deployed.** No hosting, no CI, no migrations run
  anywhere but this laptop — the public URL so far was a tunnel *to* this laptop,
  which is not the same thing and proves nothing about a cloud environment. The
  `btree_gist` extension in the M3 migration needs a role permitted to create
  extensions, which on managed Postgres is often not the application's own user.
  The repo is now deploy-*ready* (see "Deployment"); it has never been deploy-*ed*.
- **No notifications.** Neither the customer nor the salon is told anything
  outside the web UI. SMS/WhatsApp is near-mandatory in this market.
- **No photo uploads.** `coverImageUrl` and `SalonPhoto` are modelled; no page
  renders them and no form sets them.

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
- **A booking stays `PENDING` forever.** Nothing moves it to `CONFIRMED`,
  `COMPLETED` or `NO_SHOW` — that is the M4 owner dashboard. Until then the
  status badge always reads "Awaiting confirmation".
- **No booking notifications.** The customer sees a banner and nothing else; the
  salon is not told at all. SMS/WhatsApp is near-mandatory in this market.
- **Bookings can be made up to the current minute**, and cancelled up to the
  moment they end. Both want a product-decided lead time.
- Staff assignment takes the first free qualified member in name order, so the
  alphabetically-first stylist absorbs most of the load. Fine for correctness,
  poor for fairness — balance by load when it matters.
- `createBooking` accepts a `notes` field that no UI sends: one form per slot
  leaves nowhere to type it. Needs a confirmation step between slot and booking.
- The same service twice in one visit is rejected (the engine matches staff by
  service id, so a repeat is indistinguishable). Two haircuts for two people is a
  real request; it needs a quantity or a per-item identity.
- Availability is recomputed on every render of the booking page, uncached.
  Cheap at three salons; a `findMany` per staff member per page view later.
- **Only the pure modules have tests.** `schedule.ts` and the actions are covered
  by the throwaway scripts described above, not by anything that runs in CI.

### 🔵 P3 — deferred schema decisions

- Working hours exist only on `Staff`, never on `Salon`; availability needs both.
  The salon detail page works around this by showing the **union** of staff
  hours — the widest window anyone is available. That is a display approximation,
  not opening hours, and it will diverge the moment a salon's posted hours differ
  from its team's shifts. The booking engine has the same gap from the other
  side: it derives the bookable window purely from shifts, so a salon that closes
  early while one stylist stays late will sell slots after closing.
- `Prisma.Decimal` is used for money in the booking action, but the availability
  layer passes prices around as strings and the UI formats through `Number()`.
  Consistent enough at two decimal places; worth unifying before M5.
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

- **Building inside OneDrive silently serves stale code.** Worse than the `EPERM`
  noted below, and it cost most of an hour on 2026-07-23. OneDrive treats files
  the build is writing under `.next` as edit conflicts: it renames the new file
  to `<name>-DESKTOP-XXXXXXX.js` and restores the *previous* version under the
  original name. The build reports success, `next start` then serves a mix of new
  and old chunks, and nothing anywhere errors. The symptom was an Arabic page
  rendering `Booking.title` — a message catalog chunk from the last build paired
  with this build's page code.
  - **Detect it:** `find .next -name "*DESKTOP*"` after a build. Any hit means
    the build output is untrustworthy.
  - **Fix it:** verify from a copy outside the synced tree. `distDir` does not
    help — Turbopack rejects a path that navigates out of the project root:
    ```bash
    tar cf - --exclude=node_modules --exclude=.next --exclude=.git . \
      | (mkdir -p /c/temp/salon-hub-verify && cd /c/temp/salon-hub-verify && tar xf -)
    cd /c/temp/salon-hub-verify && npm install && npm run build && npx next start -p 3111
    ```
    A junction back to the real `node_modules` does not work either — Turbopack
    refuses a symlink pointing out of the project root. It needs its own install.
- **`EPERM` on `.next`** for the same underlying reason: OneDrive holds handles
  while syncing. `rm -rf .next` and rebuild.
- `next dev` and `next build` both write to `.next/` and collide. Stop the dev
  server before building.
- Auth and i18n bugs here are invisible under `next dev`. Verify with
  `npm run build && npx next start`.
- `.gitattributes` now pins `* text=auto eol=lf`, so the CRLF warnings on staging
  no longer mean phantom diffs for the next machine to clone.
- Testing Arabic from Git Bash on Windows is unreliable — the shell mangles UTF-8
  arguments to `?` before curl sends them, which looks exactly like a broken
  search query. Use percent-encoded URLs when testing Arabic input, and assert on
  Arabic *output* from a `.mjs` file rather than `grep`/`node -e` with the string
  inline, which mangles it the same way.
- **Server Action forms post `multipart/form-data`.** Driving the no-JS path with
  curl needs `-F`, not `--data-urlencode`; a urlencoded post is ignored and the
  page simply re-renders as though nothing happened. The action id travels as an
  empty hidden field named `$ACTION_ID_<hash>`, which the rendered HTML contains.
- **next-intl serialises the whole message catalog into the HTML.** Grepping a
  page for an English string can match the untranslated catalog rather than
  anything rendered — anchor assertions on markup (`>Cancelled<`) instead.

## Picking up

**State at 2026-07-27.** All work is on **`master`** at `117ed87`, which now also
lives on **`origin/main`** in the **public** repo
`github.com/alqaabdq-crypto/salon-hub` (`master` tracks it; future publishes are a
plain `git push`). Working tree clean. The product is functionally complete
(M1–M5) and now wears a RedSun-style **dark theme** with a bright-olive identity;
the landing page is interactive (cursor-driven sun-glow + floating app bar). Local
database migrated and seeded (3 salons), Docker Postgres up. A Cloudflare tunnel is
currently serving a production build from `C:\temp\salon-hub-live` at
`https://pet-varies-cables-improving.trycloudflare.com` — **it dies when this
laptop sleeps.**

The whole product works end to end locally: a salon owner can sign up, get
approved, list services and staff, and take a booking a customer made on a phone,
confirm it, and be paid for it. It is deploy-ready and now published to GitHub, but
has never been deployed to a host.

**Two things have never been exercised for real, and both need an account the
project owner holds:**

- **Moyasar.** Get test keys, set `MOYASAR_SECRET_KEY` and
  `MOYASAR_WEBHOOK_SECRET`, point a webhook at `/api/payments/moyasar/webhook`,
  run one booking through. Everything downstream of that call is verified; the
  call itself is not.
- **A real host.** See "Deployment" — blocked on `vercel login` and a Neon
  connection string, nothing else.

**Two cheap design follow-ups left open:** the RedSun **sun-glow was never
screenshot-verified** (Playwright/WebKit version mismatch), so eyeball it and tune
if needed; and the now-public **README still lists the demo passwords**
(`admin1234` / `owner1234`) — scrub if that matters.

Suggested order:

1. **Deploy to Vercel + Neon.** Now the top item: a tunnel to a laptop is not a
   deployment, and the `btree_gist` extension is the likely first surprise on
   managed Postgres. The prep is done, so this is mostly waiting on two logins.
2. **One real Moyasar test payment.** Everything about payments is speculation
   until that round-trips — and it is easier to point a gateway webhook at a
   stable public URL than at a tunnel that changes hostname every run, which is
   why this now comes second rather than first.
3. **Reviews a customer can write** — the only visible feature from the original
   plan with no implementation behind it, and `avgRating` needs maintaining when
   it lands.
4. Split the auth config so the proxy stops bundling Prisma.
5. Pagination on browse, before the catalog grows past a screenful.
6. Salon-level opening hours, which both the detail page and the booking engine
   are still approximating from staff shifts.

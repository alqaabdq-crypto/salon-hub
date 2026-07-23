# Salon Hub — Progress Report

**Last updated:** 2026-07-23

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
| M1.1 | Review fixes — auth blocker, timezone, money, fonts, docs | ✅ Shipped (`10f4a5d`) |
| M1.2 | Schema — bilingual catalog, multi-service bookings, revenue models | ✅ Shipped (`10f4a5d`) |
| M2 | Customer marketplace — app shell, browse, search, salon detail | ✅ Shipped (`b0dfd0b`) |
| M3 | Booking engine — availability, overlap prevention, booking flow | ✅ Shipped |
| M4 | Salon owner + admin dashboards | 🔴 Not started |
| M5 | Payments via Moyasar | 🔴 Not started |

**M2 breakdown** — all four parts built 2026-07-19:

1. ✅ App shell — header, nav, locale switcher (wires the previously unused `Nav` keys).
2. ✅ Seed data — plans, bilingual categories, three approved salons with services,
   staff and working hours.
3. ✅ Browse and search — filter by city, gender focus, category, plus text search.
4. ✅ Salon detail — services, team, opening hours, reviews.

### Branch

M1.1, M1.2 and M2 are committed on **`feat/m2-marketplace`**, branched from
`master` at `9d59dad`. `master` itself is unchanged — merge or fast-forward when
ready:

```bash
git checkout master && git merge --ff-only feat/m2-marketplace
```

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

## Completed 2026-07-23

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

## Open issues

### 🔴 P0 — a booking is a free, permanent hold

Nothing expires a `PENDING` booking and nothing charges for one. A signed-in
customer can reserve every slot a salon has, indefinitely, at no cost, and the
EXCLUDE constraint will faithfully keep anyone else out. This is only safe while
the seeded data is the only data. Before real listings, it needs at minimum a
hold expiry, and properly it needs M5 payments (deposit at booking) plus per-
customer rate limiting.

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

**State at end of 2026-07-23.** Everything through M3 is committed on
`feat/m2-marketplace` (`master` still at `9d59dad` and needs a merge). Working
tree clean; typecheck, lint, build and 32 tests all pass. Local database is
migrated and seeded, and holds no bookings — the verification runs cleaned up
after themselves.

**Nothing is blocking M4.** The overlap decision that blocked M3 is settled and
implemented; its consequence is the rule that M4 has to obey: *any code path
that changes `Booking.status` changes its `BookingItem.status` in the same
transaction.* The owner dashboard is exactly where that rule will first be
tested, since confirm/complete/no-show all move status.

Suggested order:

1. **M4 salon owner dashboard**, starting with confirm/cancel on a booking — it
   closes the loop M3 opened, since every booking currently sits at `PENDING`
   with nobody able to act on it.
2. **Hold expiry** (P0 above). Even before payments, a `PENDING` booking older
   than some window should stop reserving staff, or one account can freeze a
   salon's calendar for free.
3. Split the auth config so the proxy stops bundling Prisma.
4. Pagination on browse, before the catalog grows past a screenful.
5. Salon-level opening hours, which both the detail page and the booking engine
   are currently approximating from staff shifts.

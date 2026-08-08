# Salon Hub — Progress Report

**Last updated:** 2026-08-08

Salon Hub is a bilingual (English / Arabic, RTL) salon-booking marketplace for
Saudi Arabia. Customers discover and book salons; salon owners manage their
listing, staff and schedule; admins verify salons before they go live.

---

## ▶ Last request and answer

> **Read this first when reviewing this report, and lead with it.** Standing
> instruction from the project owner: begin a review by stating what was last
> asked for and what the answer was, before anything else.

**Asked (2026-08-08, latest):** *"make the commission in the free plan 30%."*

**Answered:** `DEFAULT_PLATFORM_COMMISSION` is now **0.30**, up from 0.15.

That constant *is* the free-tier rate: the `FREE` plan carries a null
`commissionRate` and inherits it, as does a salon with no subscription at all.
Changing it in one place was therefore the whole change — no migration, and the
precedence chain (**salon override → plan rate → platform default**) is untouched.
Premium still buys **10%**, so the gap that justifies the SAR 199/month
subscription widened from 5 points to **20**.

**The demo seeder was reworked to stop contradicting it.** It had hardcoded
15%/12%/15% per salon, which would have silently disagreed with the new default.
It now puts each salon on a real tier and resolves the rate through the same
`resolveCommissionRate` the payment path uses, so all three routes are exercised
rather than merely unit-tested:

| Salon | Route | Rate |
| --- | --- | --- |
| Rose Beauty Lounge | `FREE` plan → platform default | **30%** |
| Glow Studio | negotiated salon override | **20%** |
| Al Fursan Barbers | `PREMIUM` plan rate | **10%** |

**The `Subscription` table now has rows for the first time** — previously empty,
which is why the plan-rate branch had never run against real data. Platform
commission on the same 42 bookings rose from SAR 973.50 to **SAR 1,549**, and the
blended rate from 14.4% to **23%**.

⚠️ **Existing payments were regenerated, not repriced.** The seeder clears and
rewrites its rows, so these figures reflect the new rate. In production the
opposite holds and is the point of the design: a split is frozen at capture time,
so changing this constant never rewrites what a salon has already earned. Only
future payments would see 30%.

68 tests still pass — they assert against the constant rather than a literal — and
the 14 admin-revenue browser checks pass with the new figures.

---

**Asked (2026-08-08):** *"i need the admin dashboard to have the revenue and
how much each salon earn."*

**Answered:** New **`/admin/revenue`**, linked from the admin dashboard beside the
support queue, with the platform's own commission on the dashboard tile itself.

- **Four tiles:** platform earnings (Σ `platformFee` — the marketplace's actual
  revenue), gross processed, paid to salons, and settled payment count.
- **Earnings by salon:** a table of paid bookings, gross, commission, **what the
  salon earns**, and the **realised** commission rate — `fee ÷ gross`, not the
  configured rate, so a salon whose rate changed mid-period reads between the two.
  Ordered by salon earnings, with a totals row that reconciles.
- **Monthly platform earnings** reusing the existing `RevenueChart` rather than
  building a second chart.
- Money summed with `Prisma.Decimal` throughout. The dashboard tile uses a SQL
  `aggregate` since it needs one number; the table aggregates in JS because the
  grouping key (`salonId`) lives on the related `Booking`, which Prisma cannot
  `groupBy` directly — hence the explicit `take: 5000` rather than an unbounded read.

**The demo seeder was rewritten**, which fixes a defect recorded on 2026-08-04:
it used fixed `daysAgo` offsets, so **the current month was always empty** and the
six-month chart grew a trailing zero bar as time passed. Months are now derived
from today, and bookings never land in the future. It also seeds **all three
salons** instead of one, at deliberately different volumes and commission rates
(15% / 15% / **12%** negotiated override) — with a single rate the page cannot
show whether it reports the realised rate or just repeats the default.

The resulting data makes the point the page exists to make: **Al Fursan has the
most paid bookings (19) and earns the least (SAR 1,100)**, because its services are
cheap and its rate is lower.

**Verified with 14 browser checks:** the dashboard link and its figure, one row per
earning salon, ordering by earnings, rates genuinely differing per salon, a totals
row, the chart including the current month, Arabic RTL with no missing messages,
and **a salon owner being refused** at `/admin/revenue`. Totals reconcile against
Postgres — 42 paid, SAR 973.50 commission, 14.4% blended. Typecheck, lint and 68
tests clean.

⚠️ **These are seeded payments, not real ones.** Moyasar has still never been
called; every figure here comes from rows the demo seeder wrote.

---

**Asked (2026-08-07):** *"please update the progress report also github."*

**Answered:** `PROGRESS.md` was **already current and already pushed** — `HEAD` and
`origin/main` were both at `a4a95f8` before this request, carrying the support
feature. Rather than report "nothing to do", the check found what actually *was*
stale on GitHub: **the README**.

It still described payments as "planned" (they shipped in M5), stopped before
maps, photos and support existed, and — the long-running item — **published the
admin password in a public repository**. Now fixed:

- **Password leak closed.** Open since the repo went public on 2026-07-27. The
  README no longer prints `admin1234` / `owner1234`; it directs you to set
  `SEED_ADMIN_PASSWORD` / `SEED_OWNER_PASSWORD` and notes the localhost defaults
  live in `prisma/seed.ts`. Worth stating plainly: **those passwords were public
  for eleven days and are in the git history**, so treat them as burned.
- New sections for **Location and discovery**, **Photos** and **Customer service**,
  each carrying the constraint that bites rather than just the feature list — the
  OSM attribution licence condition, Nominatim's rate limit, EXIF/GPS stripping,
  the object-storage migration this will need, and the absence of real rate
  limiting on `/help`.
- Routing table, project layout, testing section and demo-seeder commands brought
  up to date. Testing now says outright that **only the pure modules are in CI**.

---

**Asked (2026-08-07):** *"build me a customer services option."* — scoped in
follow-up to **support against the platform** (not salon messaging), with the loop
closed: **submit → admin replies → customer reads the reply**.

**Answered:** New `SupportTicket` model, a public `/help` page, and an admin queue
at `/admin/support`. Migration `20260807200000_support_tickets`.

- **Guests can raise a ticket.** `customerId` is nullable on purpose — the person
  most in need of support is often the one who cannot sign in — so `name` and
  `email` are always captured rather than read off the account. The admin queue
  flags account-less tickets, since "I cannot sign in" is exactly the case.
- **Signed-in customers see the loop close.** Their tickets, statuses and the
  admin's reply all appear on `/help` under their own history. A signed-out sender
  is told plainly that they will not see the reply there.
- **A ticket can carry a booking**, but only one the sender actually owns —
  otherwise the field is a way to probe whether an arbitrary booking id exists.
- **Answering and closing are separate acts.** Replying sets `ANSWERED`; the admin
  ticks a box to also mark `RESOLVED`, because most replies invite a follow-up.
  Status can be moved without a reply, for things handled by phone.
- **Spam mitigations that survive JS being off** — the concern raised when
  `SiteReview` shipped with open submission and nothing else. A honeypot field
  (accepted with a normal success redirect, so a bot learns nothing), length
  limits, and a cap of 5 open tickets per email address. **None of this stops a
  determined attacker**; real rate limiting or a captcha would.
- Whole thing is no-JS: plain Server Action forms, plain link filters on the queue.

**Verified with 19 browser checks** covering the entire loop end to end — guest
submits, customer submits, admin replies, customer reads it back — plus the
**authorization boundary** (signed out → login, salon owner → home) and Arabic RTL
with no missing messages. Confirmed against Postgres that the **honeypot submission
was silently discarded** rather than merely appearing to succeed, which the browser
alone could not tell. Typecheck, lint and 68 tests clean.

⚠️ **Notifications still do not exist**, and this feature wants them more than
anything built so far: a customer only discovers a reply by returning to `/help`,
and an admin only discovers a ticket by opening the queue. See "What is genuinely
not done".

**Mistake worth recording — I destroyed the build directory.** A `tar` in a command
whose shell had reset its working directory to `C:\Users\Admin` archived the **home
directory** into `C:\temp\salon-hub-live`. No source was touched (tar only read),
and the target is a disposable build copy, but it had to be purged with robocopy
and rebuilt from scratch. **Every sync command now uses `tar -C <project> …`** so a
reset cwd cannot redirect it. Full note under "Environment notes".

---

**Asked (2026-08-07):** *"now add the salon cover photo as well."*

**Answered:** Done, on the machinery built an hour earlier. Owners upload a cover
on `/owner/profile`; it renders as a full-bleed hero on the salon page **and on the
browse cards, which were text-only until now** — the biggest visual change the
marketplace has had.

- **`Salon.coverImageUrl` is gone**, replaced by `coverImageId` the same way
  `Staff.photoUrl` was. Migration `20260807190000_salon_cover_image`. That is both
  of M1's dead image columns now removed.
- **The size cap became per-kind.** `MAX_EDGE` is now `{ avatar: 512, cover: 1280 }`
  — an avatar renders at ~96px, a cover spans the full 1024px content column. A
  3000×2000 upload comes back **1280×853 and 2 KB**.
- **The replace/remove/cleanup dance is shared, not duplicated.** `readUpload`
  turns a posted file field into one of three intents — write, clear, or leave
  alone — and both `saveSalon` and `saveStaff` use it. `saveStaff` was refactored
  onto it and re-verified afterwards.

**Verified with 10 new browser checks** on top of the 13 for staff photos: upload
accepted, resized to the cover cap specifically (proving the two limits are really
distinct), aspect ratio preserved, replacing deletes the old row, **a save that
never touches the file input keeps the existing cover**, removal 404s, and the
detail page falls back cleanly with no cover. The staff suite was re-run after the
refactor and still passes. 9 images in the database against 9 references — **no
orphans**, so the lifecycle handling holds. Typecheck, lint and 68 tests clean.

⚠️ **Still placeholders.** `scripts/seed-sample-photos.ts` (renamed from
`seed-sample-staff-photos.ts`) now seeds both avatars and covers — abstract
gradients, not stock photography. The generated covers have the salon name baked
into the image, so the name appears twice on a card; that is an artifact of the
placeholder, not of the layout.

---

**Asked (2026-08-07):** *"allow the owners to put profile pictures or
individuals picture in their bio."* — scoped in follow-up to **staff photos**,
stored **in Postgres and served by a route** (chosen over object storage because it
needs no account, no keys and no bill, and behaves the same on Neon once deployed).

**Answered:** Owners can now upload a photo per team member on `/owner/staff`. It
appears beside their bio on the public salon page and in the owner's team list,
falling back to their initials when there is none.

- **`Staff.photoUrl` is gone.** It was modelled in M1, never written, and null on
  all six rows. Two ways to specify a photo would have been one too many, so it is
  replaced by `photoId` pointing at a new `Image` table (bytes, MIME, dimensions,
  size). Migration `20260807120000_staff_photo_images`.
- **Uploads are re-encoded, not just stored.** `server/images/store.ts` runs every
  file through sharp: EXIF rotation applied then stripped, resized to fit 512px
  without upscaling, re-encoded to WebP q78. A 1800×2400 JPEG came out **384×512
  and 0.4 KB**; all six seeded avatars together are **14 kB**. Stripping EXIF is
  not incidental — phone photos carry GPS, and staff photos should not quietly
  publish where they were taken.
- **The declared MIME type is treated as a claim, not a fact.** A `.png` containing
  text is rejected because sharp cannot decode it. SVG is refused outright: it is a
  document, it can carry script, and serving one from our own origin would be
  stored XSS.
- **It works with JavaScript off** — a plain `<input type="file">` in the existing
  Server Action form, which already posts `multipart/form-data`.
- **Lifecycle is handled.** Replacing or removing a photo deletes the old row;
  leaving the field empty keeps the current photo; a rejected upload leaves the
  existing one intact; and a rollback deletes bytes stored before the transaction
  opened, so nothing is stranded.
- Served by `/api/images/[id]` with `immutable` caching — safe because an id never
  changes what it points at — plus `nosniff`. **The route is deliberately
  unauthenticated**; these are public staff photos. It would need an owner check
  before being reused for anything private.

**Verified with 13 browser checks** driving a real upload end to end: accepted,
resized, served as WebP, cached immutably, visible on the public salon page,
junk file rejected *with a message that says why*, the existing photo surviving
that rejection, and removal returning 404. Typecheck, lint and 68 tests clean.

**Two mistakes worth recording.** The verification script clicked
`form button[type="submit"]`, which matched the **first** form on the page — a
"Deactivate" form — so it silently deactivated Layla while reporting `saved=1`.
Restored. Scope submit clicks to the form you mean (`form:has(input[name="photo"])`).
Separately, two Server Actions on one page have **two different action ids**, and
posting to the wrong one succeeds with a 303 while doing nothing at all.

⚠️ **The avatars now showing are placeholders**, from
`scripts/seed-sample-photos.ts` (demo only, idempotent, `--clear` removes
them, never overwrites a real upload). They are abstract gradient discs, not stock
portraits of people who do not exist.

---

**Asked (2026-08-07):** *"review the progress report and create the url for
me so i can see the process and replace as required."*

**Answered:** Reviewed (led with the entry below) and **brought the URL back**:
**`https://connections-vehicles-friday-country.trycloudflare.com`**.

No rebuild was needed — Docker Postgres was still up, the production server on
`:3111` had survived, and the only commits since the last build (`e3fc61c`,
`7dfdf01`) touch `PROGRESS.md` alone, so the running build already matched HEAD.
What had died was the **quick tunnel**: the `cloudflared` process was still alive
from 2026-08-04 but its hostname had expired and returned nothing. Killed it and
minted a fresh one — **this is the normal failure mode, and the process staying up
is not evidence the tunnel works. Always curl the hostname, not the process list.**

Re-verified rather than trusting the 200s: six routes respond, and all **12 browser
checks pass** against the new hostname (tiles paint, pin badge `★ 4.8`, popup reads
*"Rose Beauty Lounge ★ 4.8 · 4 reviews · 2.7 km away"*, picker prefills and rewrites
on click, Arabic renders RTL).

**Nothing was replaced or changed** — the request was to see it, and no specific
amendment followed. The open gaps are unchanged: no customer review-writing (so
every star on the site is still seeded), no real deployment, no Moyasar test call.

---

**Asked (2026-08-04):** *"i need the owner of the salon to be able to select
the location through maps"* — scoped in follow-up to: **owner picks the location,
and customers see what is near them and the ratings of the salons near them.**
Provider chosen by the owner: **Leaflet + OpenStreetMap** (no API key, no billing).

**Answered:** Built all three parts. `Salon.lat`/`lng` had existed since M1 but
**nothing ever wrote them** — `saveSalon` dropped the fields — so the columns were
dead. They are now the backbone of the feature.

- **Owner picker** (`src/components/map/location-picker.tsx`) on `/owner/profile`:
  drag the pin, click the map, search an address (Nominatim, biased to `sa`), or
  use the browser's location. **Degrades to two plain number inputs with JS off** —
  those inputs are the source of truth and the only thing posted, so the map is a
  nicer way to fill them, not a second code path. `saveSalon` now validates and
  stores the pair; blank clears it, and **half a coordinate stores neither**.
- **Customer "near me"** on `/salons`: a `NearMeButton` writes `?lat=&lng=` into
  the URL and the **server** does the rest, so results stay shareable and
  back-button-correct. Proximity is a two-step filter — a bounding box in SQL
  (new `@@index([status, lat, lng])`; there is no PostGIS) then exact Haversine
  in JS to trim the box's corners and sort nearest-first. A radius selector
  (2/5/10/25/50 km) rides along as hidden fields so other filters do not drop it.
- **Ratings** now appear on browse cards and in map popups. They were **0.0 on
  every salon**: `avgRating`/`reviewCount` are denormalised and nothing maintained
  them. Added `recomputeSalonRating` (`src/server/salon/rating.ts`), which
  recomputes the aggregate from `Review` rows and accepts a transaction client.
- **Dark basemap.** OSM ships light tiles; against this near-black theme that was
  a glaring white rectangle. Filtered to a dark map via `.leaflet-tile-pane` —
  **not** `.leaflet-tile`, because Leaflet's own CSS declares
  `.leaflet-tile { filter: inherit }` and loads later, which is exactly the hook
  that declaration exists to provide.

**Verified — and this time actually looked at.** The long-standing
Playwright/WebKit mismatch was fixed by installing **Chromium**, so the "never
screenshot-verified" caveat carried since 2026-07-27 is **closed**. 12 automated
browser checks pass against the live tunnel: tiles paint, the pin renders with its
rating badge (`★ 4.8`), the popup reads *"Rose Beauty Lounge ★ 4.8 · 4 reviews ·
2.7 km away"*, the picker prefills the saved pin, clicking the map rewrites the
latitude, and the Arabic page renders RTL. Server-side round-trips confirmed
against Postgres: a moved pin persists, a cleared pin nulls both columns and drops
the salon out of "near me", and a 2 km radius correctly excludes a salon 2.7 km
away. 68 unit tests pass (**25 new**, over Haversine, bounding boxes and coordinate
parsing), typecheck and lint clean.

**Two things the screenshots caught that the assertions did not:** the "Show all
salons" button was stretching to full page width (fixed), and **I corrupted the
Rose salon's Arabic copy** — my verification `curl` posts ran through Git Bash,
which mangles UTF-8 arguments to `?`, exactly as this file's environment notes
warn. Repaired by piping UTF-8 SQL to `psql` from a file. Worth remembering: that
trap bites writes, not just reads.

⚠️ **The ratings are seeded, not earned.** `scripts/seed-sample-reviews.ts` (demo
only, not in git's product path, idempotent) creates completed bookings with
reviews for all three salons — because `Review.bookingId` is required and unique,
a review cannot exist without a real visit, which is why this cannot live in
`prisma/seed.ts`. **Nothing in the app creates a review yet**, so
`recomputeSalonRating` currently has no production caller. Customer review-writing
is still the open gap it was before.

---

**Asked (2026-08-04):** *"please review the progress report and produce url
for the project so we can amend and improve."*

**Answered:** Reviewed (led with the section below, as instructed) and **brought a
browsable URL back up**: started Docker Postgres, re-synced source to
`C:\temp\salon-hub-live`, clean production build, `next start -p 3111`, Cloudflare
quick tunnel → **`https://treasure-satin-jones-usd.trycloudflare.com`**. Smoke-tested
`/en`, `/ar`, `/en/salons`, a salon detail page and `/en/auth/login` (all 200), plus
an **authed** check as `owner.rose` confirming the revenue chart still renders after
the rebuild. ⚠️ Same ephemeral tunnel as before — hostname rotates on relaunch, dies
when the laptop sleeps. The **durable** URL (Vercel + Neon) is still owed and still
blocked on `vercel login` + a Neon connection string.

**Found while verifying — the revenue chart's window has rolled forward.** The demo
seeder spread bookings Feb–Jul 2026; the chart shows a trailing 6 months, so as of
2026-08-04 it reads *Mar 77 / Apr 357 / May 221 / Jun 128 / Jul 77 / **Aug 0*** —
February has fallen off the left and August renders as an empty slot (5 bars, not 6).
Not a bug in the chart, which is behaving exactly as specified; it is the **demo data
going stale**. Re-run `scripts/seed-sample-revenue.ts` with months rebased on *today*
(or make it seed relative to `now()`) before showing the chart to anyone, or the
newest month always reads zero.

---

**Asked (2026-07-27):** *"in the overview I need a chart representing the
revenue tab."*

**Answered:** Added a **monthly net-revenue bar chart** to the owner **Overview**
(`/owner`), above the catalog prompt, with a link through to the Revenue tab.
Server-rendered inline SVG (`src/components/revenue-chart.tsx`) — **no client JS**,
matching the site — built to the dataviz method: single series so **no legend**
(the heading names it), one **brand-olive** hue for the bars, all text in **ink
tokens** (`fill-foreground` / `fill-muted`, never the series colour), a recessive
baseline, rounded bar tops, per-bar value labels (which double as the no-JS
accessible data) and an `aria-label` summary. The page buckets SUCCEEDED
`salonNet` by the booking's month over the last 6 months. The demo seeder was
updated to spread the sample bookings ~one per month (Feb–Jul), so the chart shows
a trend: Feb 128 / Mar 77 / Apr 357 / May 221 / Jun 128 / Jul 77 (SAR net).
Verified authed as `owner.rose` (6 bars + month/value labels + Arabic title
render; build clean). ⚠️ Structural verification only — not screenshot-eyeballed
(the Playwright/WebKit mismatch again), so the layout may want a glance. Committed
+ pushed.

---

**Asked (2026-07-27):** *"another option in the owner dashboard for
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

**Live tunnel (ephemeral):** the Cloudflare quick-tunnel hostname **changes on
every relaunch** and dies when the laptop sleeps (last live 2026-08-07:
`connections-vehicles-friday-country.trycloudflare.com`). Hard-refresh (Ctrl+Shift+R)
after any redeploy to clear old CSS; it exposes the machine + local DB while up.

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
| M6 | Design & product layer — dark theme, website testimonials, owner revenue tab + chart | ✅ Shipped (`2ccee68`) |
| M7 | Location & discovery — owner map picker, proximity search, ratings surfaced | ✅ Shipped (`05ed9f1`) — ratings shown are seeded |
| M8 | Photos — staff avatars and salon covers: upload, resize/re-encode, serve from DB | ✅ Shipped — images shown are placeholders |
| M9 | Customer service — support tickets, admin reply queue | ✅ Shipped — no notifications, so replies are pull-only |
| M10 | Admin revenue — platform commission, per-salon earnings | ✅ Shipped — figures come from seeded payments |

**All seven original milestones are covered.** The first plan's M6 (reviews) and M7
(polish, SEO, deploy) were dissolved by the 2026-07-19 renumbering: review *display*
shipped with M2, review *writing* has not been built, and deployment has not been
attempted. See "What is genuinely not done" below.

⚠️ **The M6 and M7 rows above are not those original milestones — the numbers were
free and the sequence simply continued.** Both are work that came after the plan
ran out, requested session by session rather than scoped up front:

- **M6** is the 2026-07-27 UI and product session. Detail under "Completed
  2026-07-27".
- **M7** is the 2026-08-04 maps session, and it is the first milestone that ships
  with a visible gap behind it: browse cards and map pins show star ratings, and
  every one of them comes from a demo seeder, because nothing in the app writes a
  review. Detail under "Completed 2026-08-04".
- **M10** is admin revenue, 2026-08-08: platform commission totals and a per-salon
  earnings table. Reuses the M6 revenue chart. Every figure rests on seeded
  payments — Moyasar has still never been called.
- **M9** is customer service, 2026-08-07: platform support tickets with an admin
  reply queue. Complete and verified end to end, but **pull-only** — with no
  notifications, a reply is discovered by revisiting `/help` and a ticket by
  opening the queue.
- **M8** is photo uploads, 2026-08-07 — staff avatars first, salon covers the same
  day, both on the same `Image` table and route. The feature is complete and owners
  can really upload, but every image currently on screen is a placeholder from a
  demo seeder, so the same "looks finished, is seeded" caution applies as for M7's
  ratings. Detail in the two latest entries at the top of this file.

Neither was anchored in a commit message the way `Milestone 1` and `M5 integrates
Moyasar` were, so these numbers live only in this file. Treat the commit hashes,
not the numbers, as the durable reference.

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

## Completed 2026-08-04 — M7: maps, proximity search, real ratings

Committed to `master` and pushed to the public `origin/main`; HEAD `05ed9f1`.
Provider decision taken by the project owner: **Leaflet + OpenStreetMap**, chosen
over Google Maps because it needs no API key and no billing account. Google was
rejected on that basis, not on data quality — OSM's Arabic POI labels are patchier
and its rural detail is thinner, which is the trade accepted here.

### Where the JavaScript now is

Earlier entries in this file say **"the hero is the only JS surface."** That is no
longer true, and the correction matters when judging what still works without
JavaScript. There are now three client components beyond auth: the hero, the owner
**location picker**, and the customer **map + Near-me button**.

What has *not* changed is the rule behind that claim. **Every one of these is an
enhancement over something that already works server-side**: the picker sits on top
of number inputs that post on their own, and the map only draws salons the server
already chose and listed. The **booking flow remains entirely no-JS**, and browse,
filters and salon detail still render and function with scripting disabled — a
visitor without JavaScript loses the map, not the marketplace.

### The dead columns

`Salon.lat` / `Salon.lng` were added in the M1 schema and **never written**:
`saveSalon` simply did not carry the fields, so every salon in every database had
a null location. Nothing surfaced this because nothing read them either. All three
pieces below rest on those columns, so filling them was the first job.

### Owner picks a location

`src/components/map/location-picker.tsx`, on `/owner/profile`. Drag the pin, click
the map, search an address, or use the browser's location.

- **It degrades.** Two plain number inputs sit under the map, always rendered, and
  they are both the source of truth and the only thing posted. With JavaScript off
  the form still saves a location; the map is a nicer way to fill those inputs, not
  a separate path. The inputs hold **raw text**, not parsed numbers — a controlled
  numeric input backed by a parsed value cannot be cleared or half-typed, because
  `""` and `-` both fail to parse and the keystroke is rejected.
- **Address search** is Nominatim, `countrycodes=sa`, fired on submit only — never
  on keystroke, which keeps it inside Nominatim's one-request-per-second policy
  without any debouncing. **The OpenStreetMap attribution in the corner is a
  licence condition, not decoration; do not remove it.**
- **Validation.** Blank clears the location. **Half a coordinate stores neither** —
  a latitude with no longitude would otherwise pin the salon to the prime meridian.
  A point outside the Saudi bounding box warns but still saves, because the common
  mistake is transposing lat and lng, and a warning is more useful than a refusal.

### Customers find what is near them

The `NearMeButton` does one thing: write `?lat=&lng=` into the URL. **The search
itself is server-rendered**, so a proximity result is shareable, bookmarkable and
back-button-correct, and anyone arriving with those parameters already set gets the
same page. Geolocation is how the parameters get filled, not a second code path.

Proximity is two steps, because there is **no PostGIS** here:

1. A **bounding box** in SQL — an index range scan over the new
   `@@index([status, lat, lng])`. Cheap and deliberately generous: a box drawn
   round a circle includes area the circle does not.
2. **Exact Haversine in JS**, which discards the box's corner over-selection and
   sorts nearest-first. Capped at 200 rows so a hand-edited URL cannot turn this
   into an unbounded read.

Salons with no pin are excluded outright — a salon with no location cannot be
distance-ranked, and the browse page says how many were left off the map.

### Ratings that are not zero

`avgRating` and `reviewCount` are denormalised onto `Salon` so browse can sort by
rating without a join. Denormalised means something must maintain them, and until
now **nothing did** — every salon read 0.0 no matter how many reviews it had.
`recomputeSalonRating` (`src/server/salon/rating.ts`) recomputes both from the
`Review` rows and takes an optional transaction client so it can run inside the
same transaction as a review write. It recomputes rather than nudging a running
average, which would drift the moment a review is edited or deleted.

Ratings now render on browse cards and inside map popups. **See the caveat under
"What is genuinely not done": nothing in the app writes a review, so this function
has no production caller yet and the visible ratings are seeded.**

### A dark basemap

OSM ships one light tile set, which against `--background #0a0b07` was a glaring
white rectangle. Tiles are inverted and hue-rotated into a dark map. The filter is
set on **`.leaflet-tile-pane`**, not `.leaflet-tile` — Leaflet's own stylesheet
declares `.leaflet-tile { filter: inherit }` and loads after the app's CSS, so a
rule on the tile itself is silently overwritten. Inheriting from the pane is the
hook that declaration exists to provide. Leaflet's controls and attribution are
restyled to the project's tokens; markers and popups sit in other panes and keep
their own colours.

### Demo reviews — local only, not product data

`scripts/seed-sample-reviews.ts`: 9 reviews across the three salons (Rose 4.75,
Al Fursan 4.33, Glow 4.00), idempotent, marker-tagged, cleared on re-run. It has
to create a completed booking per review because **`Review.bookingId` is required
and unique** — a review cannot exist without a real visit, which is exactly why
this cannot live in `prisma/seed.ts`, whose whole point is to create no bookings.
It recomputes the aggregates through `recomputeSalonRating` rather than writing
them by hand, so a bug in that function shows up here immediately.

`prisma/seed.ts` now carries coordinates for the three salons and **backfills them
on re-seed** (its `update` clause, previously empty), so an existing database does
not keep three salons that can never appear in a proximity search.

### Verified — including, at last, with eyes

The Playwright/WebKit version mismatch that left the last two sessions'
UI work "structurally verified only" was fixed by installing **Chromium**. That
caveat is **closed**, and it paid for itself immediately (see below).

- **68 unit tests** (25 new) over Haversine against known Riyadh–Jeddah and
  Riyadh–Dammam distances, bounding-box containment on the compass rose, the
  longitude-span widening with latitude, pole clamping, and coordinate parsing
  including transposed pairs and out-of-range values.
- **12 browser checks** against the live tunnel: tiles paint, the pin carries its
  rating badge (`★ 4.8`), the popup reads *"Rose Beauty Lounge ★ 4.8 · 4 reviews ·
  2.7 km away"*, the picker prefills the saved pin, clicking the map rewrites the
  latitude input, and the Arabic page renders RTL.
- **Server round-trips against Postgres**: a moved pin persists through the Server
  Action; a cleared pin nulls both columns and the salon drops out of proximity
  results; a half-coordinate post stores neither; a 2 km radius correctly excludes
  a salon 2.7 km away that a 10 km radius includes.

**Two defects the screenshots caught that the HTTP assertions did not:** the "Show
all salons" button was stretching to full page width, and the Rose salon's Arabic
copy had been **corrupted to `???????`** by the verification `curl` posts — Git
Bash mangles UTF-8 in command arguments, a trap this file already documented for
*reads* and which turns out to bite *writes* far harder. Both fixed; the note is
now in "Environment notes".

---

## Completed 2026-07-27 — M6: publish, redesign, reviews, revenue

A UI/product session layered on the finished M1–M5 core. Everything below is
committed to `master` and pushed to the public `origin/main`; HEAD `2ccee68`.

### Published to GitHub (public)

Linked the owner's existing `salon-hub` repo, pushed the full history
`master → main` (replaced a placeholder "Initial commit" via `--force-with-lease`),
and flipped it **private → public**: `github.com/alqaabdq-crypto/salon-hub`.
`master` tracks `origin/main`, so publishing is now a plain `git push`. ⚠️ The
README still lists the demo passwords (`admin1234` / `owner1234`), now publicly
visible — scrub offered, not yet done.

### Design — RedSun-style dark theme

Iterated colourful → white/olive → a dark, near-black "RedSun" look (from a
Pinterest reference), keeping olive as a bright accent. Dark is forced site-wide
via a class variant (`@custom-variant dark` + `.dark` on `<html>`), safe because
every page was already dark-aware. Near-black surfaces (`--background #0a0b07`),
bright accent (`--color-brand #b6d94a`), dark-text primary button. Landing hero
rebuilt centred: pill badge → white headline → dual CTAs → a glowing olive "sun"
arc (`.sun-disc`/`.sun-wrap`) → a floating glass app bar, with sun + bar
parallaxing to the cursor. Depth/motion utilities (`.scene`, `.glass`,
`.shadow-depth`, `.card-3d`, orbs, `fade-up`) behind a `prefers-reduced-motion`
guard; the hero is the only JS surface. Dark contrast ≥ 7:1. ⚠️ Never
screenshot-verified (Playwright/WebKit mismatch) — the sun-glow may want tuning.

### Website reviews (testimonials)

New `SiteReview` model + migration `20260727162818_site_reviews` (name, rating 1–5,
comment, createdAt). A "Loved by our community" section at the **bottom of the
landing page**: a no-JS Server-Action form (name, star rating, comment) plus
gold-star review cards in dark glass, bilingual (`SiteReviews` namespace, ICU
plurals). `createSiteReview` is zod-validated, **open submission (no login)**.
Verified end-to-end (submit → 303 → persist → render; error/empty/Arabic states).
Distinct from the still-missing per-salon review writing. ⚠️ Open submission is
spam-exposed; one test review ("Sara A.") left in the DB as a visible example.

### Owner Revenue tab

New `/owner/revenue`: four tiles — your earnings (Σ `salonNet` on SUCCEEDED), gross
processed, platform fees, paid-bookings count — an *awaiting payout* pill, and a
recent-payments list. Money summed with `Prisma.Decimal`. `navRevenue` link added
to the owner layout; bilingual `rev*` copy. Verified authed as `owner.rose`.

### Owner Overview revenue chart

Server-rendered inline SVG (`src/components/revenue-chart.tsx`): monthly net
revenue for the last 6 months on `/owner`, linking to the Revenue tab. Built to the
dataviz method — single series (no legend), one brand-olive hue, text in ink tokens,
recessive baseline, rounded bars, per-bar value labels + `aria-label` summary. The
page buckets SUCCEEDED `salonNet` by the booking's month. ⚠️ Structural
verification only (not screenshot-eyeballed).

### Demo revenue data — local only, not in git

`scripts/seed-sample-revenue.ts` — idempotent (marker-tagged rows, cleared on
re-run), resolves salon/services/staff/customers by name/email. Seeds 6 paid + 1
refunded booking for the Rose salon spread ~one per month, so the tiles
(net SAR 986 / gross 1,160 / fees 174 / 6 paid) and the chart (Feb–Jul trend)
populate. Demo-only; safe to re-run or delete.

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
- **Customers still cannot write *salon* reviews.** The per-salon `Review` renders
  on salon pages and the schema has held it since M1, but nothing creates one.
  `avgRating` / `reviewCount` finally have a maintainer as of 2026-08-04 —
  `recomputeSalonRating` in `src/server/salon/rating.ts` — but **nothing in the app
  calls it**, because nothing writes a review; only the demo seeder does. The
  ratings now visible on browse cards and map pins are seeded, not earned.
  (Note: a separate **website-testimonials** feature — `SiteReview`, on the landing
  page — *was* added 2026-07-27. That is platform feedback, not salon reviews; this
  gap is still open.)
- **Nothing has ever been deployed.** No hosting, no CI, no migrations run
  anywhere but this laptop — the public URL so far was a tunnel *to* this laptop,
  which is not the same thing and proves nothing about a cloud environment. The
  `btree_gist` extension in the M3 migration needs a role permitted to create
  extensions, which on managed Postgres is often not the application's own user.
  The repo is now deploy-*ready* and **published publicly to GitHub** (2026-07-27),
  but it has still never been deploy-*ed* to a host.
- **No notifications, and support made this worse.** Neither the customer nor the
  salon is told anything outside the web UI, and as of 2026-08-07 that now includes
  support: a customer discovers a reply only by returning to `/help`, and an admin
  discovers a ticket only by opening the queue. A support channel nobody is paged
  about is a slow support channel. SMS/WhatsApp is near-mandatory in this market;
  email would be enough for support replies specifically.
- **The salon photo *gallery* is still not done.** Staff avatars and salon covers
  both ship as of 2026-08-07, but the `SalonPhoto` table remains modelled and
  unused — there is no multi-photo gallery, and no add/remove/reorder UI. The
  upload machinery is general, so this is mostly wiring plus ordering.
- **There is one rendition per image, and browse serves the big one.** A cover is
  stored at 1280px and the browse card displays it at ~360px wide. Harmless at
  three salons (37 kB of images in total); wasteful at a hundred. The fix is a
  thumbnail rendition at upload time, or a width parameter on the image route.
- **Images live in the database, which is a decision with a shelf life.** Fine at
  14 kB of avatars; wrong once salons upload galleries. There is no CDN and every
  byte is in backups. Moving to object storage means changing the write path and
  the one read route — kept deliberately narrow for that reason.
- **Only three salons have coordinates, and they are seeded ones.** "Near me"
  works, but it can only find what has been pinned. Any salon created through the
  owner form since 2026-08-04 has a pin only if its owner set one — the field is
  optional by design, and an unpinned salon is invisible to proximity search
  while remaining fully visible everywhere else.

## Open issues

### 🟠 P1

- **Prisma and bcryptjs are bundled into the proxy**, which runs on every
  request, because `src/proxy.ts` imports the full auth config. Auth.js v5's
  split-config pattern (edge-safe `auth.config.ts` + full `auth.ts`) fixes this.
  Not fatal — Next 16 proxy runs on the Node runtime — but it is per-request weight.

### 🟡 P2

- Logged-in users can still browse to `/auth/login` and `/auth/register`.
- **Browse has no pagination.** Fine for three seeded salons, wrong at scale —
  `findMany` is unbounded. Add cursor pagination before real listings land. The
  proximity path is capped at 200 rows; the unfiltered path is not capped at all.
- **Nominatim is a third-party dependency with a usage policy**, not an SLA. Its
  address search is capped at roughly one request per second, may rate-limit or
  block a noisy origin, and **requires the OpenStreetMap attribution** rendered in
  the map corner. Search is fired on submit rather than on keystroke to stay
  inside that budget, but a busy production site should self-host a geocoder or
  buy one. Losing it degrades gracefully: the pin can still be dragged.
- **Map tiles come from `tile.openstreetmap.org`**, whose tile-usage policy
  forbids heavy automated traffic. Same conclusion — fine now, needs a paid or
  self-hosted tile source before real traffic.
- **The proximity sort is JS-side and unindexable.** The bounding box is indexed;
  the Haversine ordering that follows is not, and cannot be without PostGIS.
  Correct and fast at this catalogue size, wrong shape for a national listing.
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
- ~~`lat` / `lng` unindexed~~ — indexed 2026-08-04 (`@@index([status, lat, lng])`)
  and "near me" ships, using a bounding box plus Haversine in JS. Still **no
  PostGIS**: that composite index cannot serve a true radius, and the JS sort is
  capped at 200 rows. Fine at this size; revisit before the catalog is national.
- **`city` is still free text and monolingual.** The Arabic browse page shows
  "Riyadh" in Latin script next to fully Arabic salon copy, because `Salon.city`
  has no `cityAr`. It is also what the city filter groups on, so a typo makes a
  new city. Worth a `City` table, or at minimum a bilingual pair.
- No notifications model (SMS / WhatsApp reminders are near-mandatory here).
- No OAuth adapter tables, despite `User.image` / `emailVerified` hinting that way.
- `Review.rating` has no 1–5 constraint; `avgRating` / `reviewCount` are
  denormalised with nothing maintaining them.
- `updatedAt` exists only on `Booking`, `Payment`, `Payout` and `Subscription`.
- Salon tier is derived through `Subscription` rather than denormalised onto
  `Salon`; revisit if search ranking needs to filter on it cheaply.

---

## Environment notes

- **Never write a `tar` that depends on the shell's working directory.** The Bash
  tool's cwd resets to `C:\Users\Admin` between calls. On 2026-08-07 a
  `tar cf - … .` intended for the project archived the **entire home directory**
  into `C:\temp\salon-hub-live`, which then had to be purged with
  `robocopy /MIR` from an empty folder (plain `Remove-Item -Recurse` stalled on
  locked files under the copied `AppData`). No source was harmed — tar only reads
  — but the build copy was destroyed. **Always `tar -C <absolute-project-path>`**,
  which makes the source explicit and the cwd irrelevant.
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
- **Git Bash mangles UTF-8 in *writes*, not just reads.** A verification `curl -F
  "nameAr=صالون…"` on 2026-08-04 wrote literal `???????` into the database. The
  same trap already documented for search queries applies to any Arabic sent as a
  shell argument. Send Arabic from a **file** (`psql -f`, a `.mjs` script, curl
  `--data-binary @file`), never inline.
- **Two Server Actions on one page have two different action ids**, and posting to
  the wrong one returns **303 and does nothing**. When driving a form by hand,
  pull the id out of the specific `<form>` you mean, not the first one on the page.
- **Scope test clicks to the form under test.** `form button[type="submit"]` picks
  the first form in the document. On `/owner/staff` that is a "Deactivate" form,
  so a photo-upload test quietly deactivated a staff member and still reported
  success. Use `form:has(input[name="..."]) button[type="submit"]`.
- **Screenshots are worth taking, and `chromium` works.** Playwright's WebKit
  build mismatched its package for two sessions, which is why several features
  shipped "structurally verified" only. `npx playwright install chromium` fixed
  it. Two real defects — a full-width button and the corrupted Arabic above —
  were invisible to HTTP assertions and obvious in a screenshot.
- **Filtering Leaflet tiles** must target `.leaflet-tile-pane`, not
  `.leaflet-tile`: Leaflet's stylesheet sets `.leaflet-tile { filter: inherit }`
  and loads after the app's CSS, silently overriding a rule on the tile itself.

## Picking up

**State at 2026-08-04 (end of session).** All work is on **`master`** at `05ed9f1`,
mirrored to the **public** `origin/main` (`github.com/alqaabdq-crypto/salon-hub`);
`master` tracks it, so publishing is a plain `git push`. Working tree clean. The
M1–M5 core is functionally complete; on top of it sit the 2026-07-27 UI session
(dark theme, website testimonials, owner Revenue tab and revenue chart) and this
session's **maps work** — owner location picking, customer proximity search, and
salon ratings that are finally non-zero (see "Completed 2026-08-04").

Docker Postgres is up and migrated. Beyond the base seed (3 salons, **now with
coordinates**) it holds **demo revenue data** (`scripts/seed-sample-revenue.ts`),
**demo reviews** (`scripts/seed-sample-reviews.ts`, 9 reviews across the three
salons), one test `SiteReview`, three `reviewer.*@salonhub.sa` accounts, and a
couple of leftover test accounts — so it is **well past the pristine seed**. Both
demo seeders are idempotent, marker-tagged and safe to re-run or delete.

A Cloudflare quick tunnel serves the production build from `C:\temp\salon-hub-live`
(last live 2026-08-07: `connections-vehicles-friday-country.trycloudflare.com`);
**its hostname rotates on every relaunch**, so treat any pinned URL as ephemeral.

**Check what is actually down before rebuilding anything.** On 2026-08-07 the
Postgres container, the production server on `:3111` and even the `cloudflared`
process were all still up after three days — only the tunnel *hostname* had
expired. A live `cloudflared` process is **not** evidence of a working tunnel;
curl the hostname. In that state the whole restart is one command: kill
`cloudflared` and point a new one at 3111. Rebuild only when app code has moved —
`git diff --name-only <last-built-commit> HEAD` settles it, and doc-only commits
do not count. Full commands under "Deployment".

**Screenshot verification now works.** `npx playwright install chromium` resolved
the WebKit/package mismatch that blocked it for two sessions. Use it: two real
defects in this session were invisible to HTTP assertions.

The whole product works end to end locally: a salon owner can sign up, get
approved, list services and staff, **pin themselves on a map**, and take a booking
a customer made on a phone — possibly having found them through "near me" — then
confirm it and be paid for it. It is deploy-ready and published to GitHub, but has
never been deployed to a host.

**Two things have never been exercised for real, and both need an account the
project owner holds:**

- **Moyasar.** Get test keys, set `MOYASAR_SECRET_KEY` and
  `MOYASAR_WEBHOOK_SECRET`, point a webhook at `/api/payments/moyasar/webhook`,
  run one booking through. Everything downstream of that call is verified; the
  call itself is not.
- **A real host.** See "Deployment" — blocked on `vercel login` and a Neon
  connection string, nothing else.

**The README password leak is closed** (2026-08-07). The public README no longer
prints `admin1234` / `owner1234`; it tells you to choose `SEED_ADMIN_PASSWORD` and
`SEED_OWNER_PASSWORD` instead, and notes the defaults live in `prisma/seed.ts` for
localhost only. Open since the repo went public on 2026-07-27.

**Still open, cheap:** the RedSun sun-glow can now actually be eyeballed, since
Chromium works; it has not been tuned.

Suggested order:

1. **Reviews a customer can write.** Promoted to the top. It is now the only place
   the UI *promises* something the app cannot do: browse cards and map pins show
   star ratings, and every one of them is seeded. `recomputeSalonRating` already
   exists and is tested by the demo seeder, so this is the write path, the
   eligibility rule (a `COMPLETED` booking the reviewer owns, one review per
   booking — the schema already enforces the second), and calling the recompute in
   the same transaction.
2. **Deploy to Vercel + Neon.** A tunnel to a laptop is not a deployment. The prep
   is done; blocked on `vercel login` and a Neon connection string. Watch for
   `btree_gist` in the M3 migration — the likely first surprise on managed
   Postgres — and note the new `@@index([status, lat, lng])` needs no extension.
3. **One real Moyasar test payment.** Everything about payments is speculation
   until that round-trips, and it is far easier to point a gateway webhook at a
   stable public URL than at a tunnel that changes hostname every run — which is
   why this follows the deploy rather than preceding it.
4. **Salon-level opening hours**, which both the detail page and the booking engine
   still approximate from staff shifts.
5. Split the auth config so the proxy stops bundling Prisma.
6. Pagination on browse, before the catalog grows past a screenful. The proximity
   path is already capped at 200; the unfiltered path is still unbounded.
7. **Bilingual `city`.** Now visible rather than theoretical: the Arabic browse
   page prints "Riyadh" in Latin script beside fully Arabic salon copy.

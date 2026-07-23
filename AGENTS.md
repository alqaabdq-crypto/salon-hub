<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Reviewing the progress report

`PROGRESS.md` is the status of record. When asked to review it, **open your
response with the `## ▶ Last request and answer` section at the top of that
file** — what was last asked for, what was delivered, and what is still owed —
before any milestone summary or next steps. Update that section at the end of
any session where a substantive request is made.

# Two rules the code depends on

- **Never write `Booking.status` directly.** Use `setBookingStatus` in
  `src/server/booking/status.ts`. `BookingItem.status` is denormalised from it,
  and a partial `btree_gist` EXCLUDE constraint reads the items to decide which
  rows reserve a staff member. Miss the items and cancelled visits block their
  slots for ever.
- **Never set `AUTH_URL` or `NEXTAUTH_URL`.** `trustHost: true` covers host
  trust. Pinning an origin makes Auth.js rebase every request onto it, which
  sends locale redirects to the wrong host on any deploy, preview, proxy or
  tunnel.

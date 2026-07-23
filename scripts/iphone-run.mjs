// Drives Salon Hub through Playwright's WebKit build with an iPhone device
// profile: iPhone viewport, device pixel ratio, touch input and Mobile Safari
// user agent, rendering in WebKit rather than Chromium.
//
// This is not the iOS Simulator — that ships with Xcode and only runs on macOS.
// It is the closest faithful stand-in available on Windows: the same browser
// engine family as Safari, at iPhone dimensions.
import { chromium, devices, webkit } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3111";
const OUT = process.argv[2] ?? "./shots";
mkdirSync(OUT, { recursive: true });

const CUSTOMER = { email: process.env.CUST_EMAIL, password: "verify1234" };

const shots = [];
let failed = 0;

function check(ok, label) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed = 1;
}

async function shot(page, name) {
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  shots.push(file);
}

const engine = process.env.ENGINE === "chromium" ? chromium : webkit;

const browser = await engine.launch();
const context = await browser.newContext({
  ...devices["iPhone 15 Pro"],
  locale: "en-SA",
});
const page = await context.newPage();

// Sign in first, so the booking further down is a real one by a real customer
// rather than a redirect to the login page.
if (CUSTOMER.email) {
  await page.goto(`${BASE}/en/auth/login`, { waitUntil: "networkidle" });
  await page.fill("#email", CUSTOMER.email);
  await page.fill("#password", CUSTOMER.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/account", { timeout: 15000 }).catch(() => {});
  check(page.url().includes("/account"), "customer logs in on the phone");
}

console.log(`engine: ${engine.name()}  device: iPhone 15 Pro`);
console.log(
  `viewport: ${JSON.stringify(devices["iPhone 15 Pro"].viewport)}  dpr: ${devices["iPhone 15 Pro"].deviceScaleFactor}`,
);
console.log(`UA: ${devices["iPhone 15 Pro"].userAgent}\n`);

// --- landing ------------------------------------------------------------------
await page.goto(`${BASE}/en`, { waitUntil: "networkidle" });
check(await page.getByRole("heading", { name: "Salon Hub" }).isVisible(), "landing renders");
await shot(page, "01-landing-en");

// Nothing may scroll sideways on a phone — the classic mobile-layout failure.
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
);
check(!overflow, "landing does not scroll horizontally");

// --- browse -------------------------------------------------------------------
await page.getByRole("link", { name: "Salons" }).first().click();
await page.waitForURL("**/salons");
check(await page.getByRole("heading", { name: "Salons" }).isVisible(), "browse renders");
await shot(page, "02-browse-en");

const cards = await page.locator("main ul > li").count();
check(cards > 0, `browse lists salons (${cards})`);

// --- salon detail ---------------------------------------------------------------
await page.locator("main ul > li a").first().click();
await page.waitForURL(/\/salons\/[^/]+$/);
check(await page.getByRole("heading", { level: 2, name: "Services" }).isVisible(), "detail renders services");
await shot(page, "03-salon-en");

const noOverflowDetail = await page.evaluate(
  () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
);
check(noOverflowDetail, "salon detail does not scroll horizontally");

// --- booking page ------------------------------------------------------------------
await page.getByRole("link", { name: "Book" }).first().click();
await page.waitForURL(/\/book/);
check(await page.getByRole("heading", { name: /^Book at/ }).isVisible(), "booking page renders");

// The date defaults to today, which late in the evening is legitimately empty —
// the salon has closed. Pick the next day the team actually works.
const target = await page.evaluate(() => {
  // Riyadh is UTC+3 and the seeded salons are shut on Friday.
  let d = new Date(Date.now() + 3 * 60 * 60 * 1000 + 864e5);
  while (d.getUTCDay() === 5) d = new Date(d.getTime() + 864e5);
  return d.toISOString().slice(0, 10);
});

await page.fill("#date", target);
await page.getByRole("button", { name: "Show times" }).click();
await page.waitForLoadState("networkidle");

const slots = await page.locator('form:has(input[name="start"]) button[type=submit]').count();
check(slots > 0, `booking page offers tappable slots for ${target} (${slots})`);
await shot(page, "04-book-en");

// Touch targets: Apple's HIG asks for 44pt minimum. Slot buttons are the
// smallest thing a customer has to hit accurately.
const tooSmall = await page.evaluate(() => {
  const buttons = [...document.querySelectorAll("form button[type=submit]")];
  return buttons.filter((b) => b.getBoundingClientRect().height < 32).length;
});
check(tooSmall === 0, `slot buttons are not tiny (${tooSmall} under 32px)`);

// --- Arabic, right to left ------------------------------------------------------
await page.goto(`${BASE}/ar/salons`, { waitUntil: "networkidle" });
const dir = await page.evaluate(() => document.documentElement.getAttribute("dir"));
check(dir === "rtl", `Arabic page is RTL (dir=${dir})`);
check(await page.getByRole("heading", { name: "الصالونات" }).isVisible(), "Arabic heading renders");
await shot(page, "05-browse-ar");

const arOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
);
check(!arOverflow, "Arabic browse does not scroll horizontally");

// Arabic glyphs must actually resolve — a missing webfont shows tofu boxes and
// the paint would be blank rather than wrong.
const arabicRendered = await page.evaluate(() => {
  const el = [...document.querySelectorAll("h1")].find((n) => /[؀-ۿ]/.test(n.textContent));
  if (!el) return false;
  const { width } = el.getBoundingClientRect();
  return width > 0;
});
check(arabicRendered, "Arabic text is laid out with real glyph widths");

// --- book by tapping a slot ---------------------------------------------------------
if (CUSTOMER.email && slots > 0) {
  await page.goto(`${BASE}/en/salons`, { waitUntil: "networkidle" });
  await page.locator("main ul > li a").first().click();
  await page.getByRole("link", { name: "Book" }).first().click();
  await page.waitForURL(/\/book/);
  await page.fill("#date", target);
  await page.getByRole("button", { name: "Show times" }).click();
  await page.waitForLoadState("networkidle");

  const slot = page.locator('form:has(input[name="start"]) button[type=submit]').first();
  const slotLabel = await slot.textContent();

  // A real tap, not a synthetic click: this context has touch enabled.
  await slot.tap();
  await page.waitForURL("**/account**", { timeout: 15000 }).catch(() => {});

  check(page.url().includes("/account"), `tapping the ${slotLabel} slot books it`);
  check(
    await page.getByText("Awaiting confirmation").first().isVisible(),
    "the new booking is listed on the account page",
  );
  await shot(page, "06-account-booked-en");
}

console.log(`\nscreenshots: ${shots.length}`);
for (const file of shots) console.log(`  ${file}`);

await browser.close();
process.exit(failed);

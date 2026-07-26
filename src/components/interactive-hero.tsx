"use client";

import { useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

// RedSun-style hero: a centered headline over a glowing olive "sun", with a
// floating app bar resting on the horizon. The sun and bar parallax gently
// toward the cursor — the only JS on the site; the booking flow stays no-JS.
export function InteractiveHero() {
  const t = useTranslations("Landing");
  const th = useTranslations("Home");
  const tNav = useTranslations("Nav");
  const rootRef = useRef<HTMLDivElement>(null);

  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const onMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = rootRef.current;
      if (!el || reduce) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5; // -0.5 … 0.5
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--sun-x", `${(px * 30).toFixed(1)}px`);
      el.style.setProperty("--sun-y", `${(py * 14).toFixed(1)}px`);
      el.style.setProperty("--bar-x", `${(px * -16).toFixed(1)}px`);
    },
    [reduce],
  );

  const reset = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    el.style.setProperty("--sun-x", "0px");
    el.style.setProperty("--sun-y", "0px");
    el.style.setProperty("--bar-x", "0px");
  }, []);

  const appNav: [string, string][] = [
    ["🔍", th("appBrowse")],
    ["📅", th("appBookings")],
    ["❤️", th("appFavourites")],
    ["👤", th("appProfile")],
  ];

  return (
    <section
      ref={rootRef}
      onMouseMove={onMove}
      onMouseLeave={reset}
      className="relative mx-auto w-full max-w-5xl px-6 pt-14 text-center md:pt-20"
    >
      {/* Two-part pill badge. */}
      <div className="flex justify-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface/70 py-1 pe-3 ps-1 text-sm backdrop-blur">
          <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-bold text-[#10130a]">
            {th("pillNew")}
          </span>
          <span className="text-muted">{th("pillText")}</span>
          <span aria-hidden className="text-brand">›</span>
        </span>
      </div>

      {/* Headline + sub. */}
      <h1 className="mx-auto mt-7 max-w-3xl text-4xl font-extrabold leading-[1.06] tracking-tight sm:text-6xl md:text-7xl">
        {th("heroTitle")}
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-lg text-muted">{t("subtitle")}</p>

      {/* CTAs: ghost + solid accent. */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/salons"
          className="rounded-full border border-hairline bg-surface/60 px-6 py-3 font-semibold backdrop-blur transition hover:border-brand/40"
        >
          {t("browse")} <span aria-hidden>→</span>
        </Link>
        <Link href="/auth/register" className="btn-brand rounded-full px-6 py-3">
          {t("cta")} <span aria-hidden>→</span>
        </Link>
      </div>

      {/* The rising sun. */}
      <div className="sun-wrap" aria-hidden>
        <div className="sun-disc" />
      </div>

      {/* Floating app bar sitting on the horizon. */}
      <div
        className="relative z-10 -mt-20 md:-mt-28"
        style={{ transform: "translateX(var(--bar-x, 0px))", transition: "transform 0.3s ease-out" }}
      >
        <div className="glass shadow-depth mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <span className="text-gradient-brand text-sm font-extrabold tracking-tight">
            {tNav("brand")}
          </span>

          <div className="hidden items-center gap-5 text-sm text-muted sm:flex">
            {appNav.map(([icon, label]) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <span aria-hidden>{icon}</span>
                {label}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <span aria-hidden className="text-muted">🔔</span>
            <span aria-hidden className="gradient-brand h-7 w-7 rounded-full ring-2 ring-surface" />
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

// The landing hero. The booking-card mock tilts toward the cursor in real 3D
// (rotateX/rotateY driven by CSS vars), while inner layers sit forward on the
// z-axis for parallax. Deliberately the only interactive/JS surface on the site
// — the booking flow itself stays server-rendered and works without JavaScript.
export function InteractiveHero() {
  const t = useTranslations("Landing");
  const th = useTranslations("Home");
  const cardRef = useRef<HTMLDivElement>(null);

  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const onMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = cardRef.current;
      if (!el || reduce) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5; // -0.5 … 0.5
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--ry", `${(px * 16).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${(-py * 12).toFixed(2)}deg`);
    },
    [reduce],
  );

  const reset = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }, []);

  return (
    <section className="scene relative mx-auto grid w-full max-w-6xl items-center gap-10 px-6 py-16 md:grid-cols-2 md:py-24">
      {/* Ambient olive orbs, floating behind everything. */}
      <div
        aria-hidden
        className="orb gradient-brand -top-10 h-72 w-72"
        style={{ insetInlineStart: "-3rem" }}
      />
      <div
        aria-hidden
        className="orb h-64 w-64"
        style={{
          insetInlineEnd: "-2rem",
          bottom: "-3rem",
          background:
            "radial-gradient(circle at 30% 30%, var(--color-accent), transparent 70%)",
          animationDelay: "1.5s",
        }}
      />

      {/* Copy column. */}
      <div className="relative z-10 text-center md:text-start">
        <span className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface/70 px-4 py-1.5 text-sm font-medium text-brand backdrop-blur">
          <span className="gradient-brand h-2 w-2 rounded-full" aria-hidden />
          {th("eyebrow")}
        </span>

        <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-6xl">
          <span className="text-gradient-brand">{t("title")}</span>
        </h1>

        <p className="mx-auto mt-4 max-w-xl text-lg text-muted md:mx-0">
          {t("subtitle")}
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3 md:justify-start">
          <Link href="/salons" className="btn-brand rounded-full px-7 py-3 font-semibold">
            {t("browse")}
          </Link>
          <Link
            href="/auth/register"
            className="rounded-full border border-brand/40 px-7 py-3 font-semibold text-brand transition hover:bg-brand/10"
          >
            {t("cta")}
          </Link>
        </div>
      </div>

      {/* 3D card column. */}
      <div className="relative z-10 flex justify-center md:justify-end">
        <div
          ref={cardRef}
          onMouseMove={onMove}
          onMouseLeave={reset}
          className="tilt glass shadow-depth w-full max-w-sm rounded-3xl p-6"
        >
          <div className="flex items-center justify-between">
            <span className="layer-1 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
              {th("cardBadge")}
            </span>
            <span className="text-sm font-medium text-gold" aria-hidden>
              ★★★★★
            </span>
          </div>

          <div className="layer-2 mt-6">
            <p className="text-xl font-bold">{th("cardService")}</p>
            <p className="mt-1 text-sm text-muted">{th("cardMeta")}</p>
          </div>

          {/* A little floating avatar row for depth. */}
          <div className="layer-1 mt-6 flex items-center gap-2">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                aria-hidden
                className="gradient-brand h-8 w-8 rounded-full ring-2 ring-surface"
                style={{ marginInlineStart: i === 0 ? 0 : "-0.75rem" }}
              />
            ))}
            <span className="ms-2 text-xs text-muted">+12</span>
          </div>

          <div className="layer-2 mt-6 flex items-center justify-between border-t border-hairline pt-5">
            <span className="text-2xl font-extrabold text-brand">{th("cardPrice")}</span>
            <span className="btn-brand rounded-full px-5 py-2.5 text-sm font-semibold">
              {th("cardBook")}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

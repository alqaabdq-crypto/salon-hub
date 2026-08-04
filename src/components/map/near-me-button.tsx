"use client";

import { useCallback, useState } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Asks the browser where the user is, then puts that in the URL.
 *
 * Deliberately the only thing this component does. The distance search itself is
 * server-rendered from `?lat=&lng=`, which keeps the result list shareable,
 * bookmarkable and back-button-correct, and leaves the page working for anyone
 * who arrives with those parameters already set. Geolocation is simply the
 * convenient way to fill them in — it is not a separate code path.
 */
export function NearMeButton({ active }: { active: boolean }) {
  const t = useTranslations("Salons");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [state, setState] = useState<"idle" | "locating" | "denied" | "unavailable">("idle");

  const locate = useCallback(() => {
    if (!navigator.geolocation) return setState("unavailable");

    setState("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("lat", position.coords.latitude.toFixed(6));
        params.set("lng", position.coords.longitude.toFixed(6));
        router.push(`${pathname}?${params}`);
        setState("idle");
      },
      (error) => setState(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, [router, pathname, searchParams]);

  const clear = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("lat");
    params.delete("lng");
    params.delete("radius");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }, [router, pathname, searchParams]);

  return (
    // `items-start` so the button hugs its label: a stretched column would make
    // it span the full page width.
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={active ? clear : locate}
        className="btn-brand inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-medium"
      >
        <span aria-hidden>📍</span>
        {state === "locating" ? t("locating") : active ? t("clearNearMe") : t("nearMe")}
      </button>

      {/* Permission is the user's to give. If they refuse, say so once and leave
          the city filter — which needs no permission — as the way through. */}
      {state === "denied" && <span className="text-xs text-amber-400">{t("locationDenied")}</span>}
      {state === "unavailable" && (
        <span className="text-xs text-amber-400">{t("locationUnavailable")}</span>
      )}
    </div>
  );
}

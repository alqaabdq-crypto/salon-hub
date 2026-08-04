"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import type { Map as LeafletMap } from "leaflet";
import {
  loadLeaflet,
  MAX_ZOOM,
  meIcon,
  pinIcon,
  TILE_ATTRIBUTION,
  TILE_URL,
} from "./leaflet";
import "leaflet/dist/leaflet.css";

export type MappedSalon = {
  id: string;
  name: string;
  slug: string;
  lat: number;
  lng: number;
  avgRating: number;
  reviewCount: number;
  distanceLabel: string | null;
};

type Props = {
  salons: MappedSalon[];
  /** The viewer's position, when they have shared it. */
  centre: { lat: number; lng: number } | null;
  locale: string;
};

/**
 * Read-only map of the salons already listed below it.
 *
 * It renders no salon the list does not contain and performs no query of its
 * own — the server decided what is nearby, and this only draws it. That keeps
 * the map and the list from ever disagreeing, and means the page is still
 * complete and usable with JavaScript off; the map simply does not appear.
 */
export function SalonsMap({ salons, centre, locale }: Props) {
  const t = useTranslations("Salons");
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;

    loadLeaflet().then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;

      map = L.map(containerRef.current, { scrollWheelZoom: false });
      L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: MAX_ZOOM }).addTo(map);

      const points: Array<[number, number]> = [];

      for (const salon of salons) {
        const rating =
          salon.reviewCount > 0 ? `★ ${salon.avgRating.toFixed(1)}` : undefined;

        const marker = L.marker([salon.lat, salon.lng], {
          icon: pinIcon(L, { label: rating }),
        }).addTo(map);

        // Built with the DOM rather than an HTML string: a salon name is user
        // input, and string-concatenating it into a popup is an injection.
        const popup = document.createElement("div");
        popup.style.minWidth = "150px";

        const link = document.createElement("a");
        link.href = `/${locale}/salons/${salon.slug}`;
        link.textContent = salon.name;
        link.style.cssText = "font-weight:600;color:#4a6b0a;text-decoration:none;";
        popup.appendChild(link);

        const meta = document.createElement("div");
        meta.style.cssText = "margin-top:4px;font-size:12px;color:#555;";
        meta.textContent = [
          salon.reviewCount > 0
            ? t("ratingSummary", { rating: salon.avgRating.toFixed(1), count: salon.reviewCount })
            : t("notRated"),
          salon.distanceLabel,
        ]
          .filter(Boolean)
          .join(" · ");
        popup.appendChild(meta);

        marker.bindPopup(popup);
        points.push([salon.lat, salon.lng]);
      }

      if (centre) {
        L.marker([centre.lat, centre.lng], { icon: meIcon(L) })
          .addTo(map)
          .bindPopup(t("youAreHere"));
        points.push([centre.lat, centre.lng]);
      }

      // Fit to everything drawn. A single point has no extent to fit, so it gets
      // a fixed zoom instead — fitBounds on a zero-area box zooms to maximum.
      if (points.length > 1) {
        map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
      } else if (points.length === 1) {
        map.setView(points[0], 14);
      }

      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
    // `t` is left out on purpose: next-intl returns a fresh function each render,
    // so including it would tear down and rebuild the map on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salons, centre, locale]);

  if (salons.length === 0) return null;

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={t("mapLabel")}
      className="mt-6 h-80 w-full overflow-hidden rounded-2xl border border-hairline bg-surface/40"
    />
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Map as LeafletMap, Marker } from "leaflet";
import { DEFAULT_CENTRE, isInSaudiArabia, parseCoords } from "@/lib/geo";
import { geocode, loadLeaflet, MAX_ZOOM, pinIcon, TILE_ATTRIBUTION, TILE_URL } from "./leaflet";
import "leaflet/dist/leaflet.css";

type Props = {
  /** Saved coordinates, if the salon already has them. */
  lat: number | null;
  lng: number | null;
};

const field =
  "rounded-lg border border-hairline bg-surface/60 px-3 py-2 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30";

/**
 * Map picker for the salon's location.
 *
 * The two number inputs are the source of truth and are always rendered, so the
 * form still posts a location with JavaScript disabled — the map is an easier
 * way to fill them, not the only way. Everything the map does ends in a write to
 * those inputs, and nothing else is posted.
 */
export function LocationPicker({ lat, lng }: Props) {
  const t = useTranslations("Location");
  const locale = useLocale();

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);

  // The inputs hold raw text, not parsed numbers. A controlled number input
  // backed by a parsed value cannot be cleared or half-typed — "-" and "" both
  // fail to parse and the keystroke gets rejected. Coordinates are derived.
  const [latText, setLatText] = useState(() => (lat === null ? "" : String(lat)));
  const [lngText, setLngText] = useState(() => (lng === null ? "" : String(lng)));
  const coords = parseCoords(latText, lngText);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ label: string; lat: number; lng: number }>>([]);
  const [status, setStatus] = useState<"idle" | "searching" | "locating" | "error" | "empty">("idle");
  const [ready, setReady] = useState(false);

  /** Moves the pin and writes the inputs. The single path by which a location
   *  is chosen, whatever the user actually clicked. */
  const place = useCallback((next: { lat: number; lng: number }, recentre = true) => {
    // Six decimals is ~0.1 m — far finer than a shopfront needs, and it keeps
    // a dragged pin from writing seventeen digits into a visible field.
    setLatText(next.lat.toFixed(6));
    setLngText(next.lng.toFixed(6));
    markerRef.current?.setLatLng(next);
    if (recentre) mapRef.current?.setView(next, Math.max(mapRef.current.getZoom(), 15));
  }, []);

  /** Moves the pin without touching the inputs — for typing, where rewriting the
   *  field to six decimals mid-keystroke would fight the user. */
  const syncMarker = useCallback((next: { lat: number; lng: number }) => {
    markerRef.current?.setLatLng(next);
    mapRef.current?.panTo(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;

    loadLeaflet().then((L) => {
      // The effect can lose its race with unmount under Strict Mode's double
      // invocation; bailing here avoids attaching a map to a detached node.
      if (cancelled || !containerRef.current || mapRef.current) return;

      const start = parseCoords(lat, lng) ?? DEFAULT_CENTRE;

      map = L.map(containerRef.current, { scrollWheelZoom: false }).setView(
        start,
        parseCoords(lat, lng) ? 16 : 11,
      );
      L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: MAX_ZOOM }).addTo(map);

      const marker = L.marker(start, { icon: pinIcon(L), draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const { lat: newLat, lng: newLng } = marker.getLatLng();
        // No recentre: the user just dragged the pin, and yanking the viewport
        // out from under them is disorienting.
        place({ lat: newLat, lng: newLng }, false);
      });

      map.on("click", (event) => place(event.latlng, false));

      mapRef.current = map;
      markerRef.current = marker;
      setReady(true);
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Mount only: later coordinate changes come from this component itself, and
    // re-running would tear down the map under the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setStatus("searching");
    setResults([]);
    try {
      const found = await geocode(trimmed, locale);
      setResults(found);
      setStatus(found.length === 0 ? "empty" : "idle");
      if (found.length > 0) place(found[0]);
    } catch {
      setStatus("error");
    }
  }, [query, locale, place]);

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) return setStatus("error");

    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        place({ lat: position.coords.latitude, lng: position.coords.longitude });
        setStatus("idle");
      },
      // Denied, unavailable or timed out all land here; the picker stays usable
      // by hand either way, so this only needs to stop the spinner.
      () => setStatus("error"),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, [place]);

  const outsideSaudi = coords !== null && !isInSaudiArabia(coords);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("label")}</span>
        <p className="text-sm text-muted">{t("help")}</p>
      </div>

      {/* Search + locate. Rendered only once the map is live: without JS these
          controls could not do anything, and an inert button is worse than none. */}
      {ready && (
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // The picker is inside the salon form; Enter here must search,
              // not submit and navigate away from a half-filled form.
              if (event.key === "Enter") {
                event.preventDefault();
                void search();
              }
            }}
            placeholder={t("searchPlaceholder")}
            className={`${field} min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={() => void search()}
            className="rounded-full border border-hairline bg-surface/60 px-4 py-2 text-sm font-medium transition hover:border-brand/40"
          >
            {status === "searching" ? t("searching") : t("search")}
          </button>
          <button
            type="button"
            onClick={useMyLocation}
            className="rounded-full border border-hairline bg-surface/60 px-4 py-2 text-sm font-medium transition hover:border-brand/40"
          >
            {status === "locating" ? t("locating") : t("useMyLocation")}
          </button>
        </div>
      )}

      {results.length > 1 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-hairline bg-surface/40 p-2">
          {results.map((result) => (
            <li key={`${result.lat},${result.lng}`}>
              <button
                type="button"
                onClick={() => place(result)}
                className="w-full rounded px-2 py-1.5 text-start text-sm text-muted transition hover:bg-brand/10 hover:text-foreground"
              >
                {result.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {status === "empty" && <p className="text-sm text-muted">{t("noResults")}</p>}
      {status === "error" && (
        <p role="alert" className="text-sm text-amber-400">
          {t("lookupFailed")}
        </p>
      )}

      <div
        ref={containerRef}
        role="application"
        aria-label={t("label")}
        className="h-72 w-full overflow-hidden rounded-xl border border-hairline bg-surface/40"
      />

      {/* The actual posted values. Always present, always editable — this is the
          no-JS path, and it is also the only thing `saveSalon` reads. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("lat")}</span>
          <input
            name="lat"
            type="number"
            step="any"
            min={-90}
            max={90}
            value={latText}
            onChange={(event) => {
              setLatText(event.target.value);
              const typed = parseCoords(event.target.value, lngText);
              if (typed) syncMarker(typed);
            }}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("lng")}</span>
          <input
            name="lng"
            type="number"
            step="any"
            min={-180}
            max={180}
            value={lngText}
            onChange={(event) => {
              setLngText(event.target.value);
              const typed = parseCoords(latText, event.target.value);
              if (typed) syncMarker(typed);
            }}
            className={field}
          />
        </label>
      </div>

      {/* A warning, not a block: the coordinate still saves. Getting lat and lng
          the wrong way round is the common mistake and lands in the ocean. */}
      {outsideSaudi && (
        <p role="alert" className="text-sm text-amber-400">
          {t("outsideSaudi")}
        </p>
      )}

      {coords && (
        <button
          type="button"
          onClick={() => {
            setLatText("");
            setLngText("");
            markerRef.current?.setLatLng(DEFAULT_CENTRE);
            mapRef.current?.setView(DEFAULT_CENTRE, 11);
          }}
          className="self-start text-sm font-medium text-brand hover:underline"
        >
          {t("clear")}
        </button>
      )}
    </div>
  );
}

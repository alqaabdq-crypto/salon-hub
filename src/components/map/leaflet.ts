import type * as LeafletNamespace from "leaflet";

export type Leaflet = typeof LeafletNamespace;

/**
 * Loads Leaflet in the browser only.
 *
 * Leaflet touches `window` while it initialises, so a static import would crash
 * the server render of any page holding a map. Importing it inside an effect
 * keeps it off the server entirely and out of the initial bundle — the map is
 * the heaviest thing on these pages and none of them need it to be interactive
 * before hydration.
 *
 * The promise is memoised so several maps on one page share a single download.
 */
let pending: Promise<Leaflet> | null = null;

export function loadLeaflet(): Promise<Leaflet> {
  pending ??= import("leaflet").then((module) => module.default ?? module);
  return pending;
}

/**
 * OpenStreetMap raster tiles. Free and keyless, which is why they were chosen,
 * but the usage policy requires the attribution below to stay visible — do not
 * remove it, and do not point heavy automated traffic at these servers.
 */
export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const MAX_ZOOM = 19;

/**
 * A marker drawn as inline SVG rather than Leaflet's default icon.
 *
 * The default icon loads two PNGs by relative URL, which bundlers rewrite and
 * routinely break; a `divIcon` has no assets to lose. It also lets the pin carry
 * the brand colour and, for the salon pins, its own rating label.
 */
export function pinIcon(L: Leaflet, options: { label?: string; dimmed?: boolean } = {}) {
  const fill = options.dimmed ? "#9a9d8c" : "#b6d94a";

  const badge = options.label
    ? `<span style="position:absolute;top:-9px;left:50%;transform:translateX(-50%);
         background:#14160e;color:#f3f4ec;border:1px solid #262a1c;border-radius:999px;
         padding:1px 6px;font-size:11px;font-weight:600;line-height:1.4;white-space:nowrap;
         font-family:system-ui,sans-serif;">${options.label}</span>`
    : "";

  return L.divIcon({
    className: "salon-pin",
    html: `<div style="position:relative;width:32px;height:42px;">
        ${badge}
        <svg width="32" height="42" viewBox="0 0 32 42" fill="none" aria-hidden="true">
          <path d="M16 41C16 41 30 26.5 30 16A14 14 0 1 0 2 16c0 10.5 14 25 14 25z"
                fill="${fill}" stroke="#10130a" stroke-width="2"/>
          <circle cx="16" cy="16" r="5.5" fill="#10130a"/>
        </svg>
      </div>`,
    iconSize: [32, 42],
    // Anchor at the pin's point, not its centre, so it sits on the coordinate.
    iconAnchor: [16, 42],
    popupAnchor: [0, -38],
  });
}

/** A small dot marking the viewer's own position — visually distinct from a salon. */
export function meIcon(L: Leaflet) {
  return L.divIcon({
    className: "me-dot",
    html: `<div style="width:18px;height:18px;border-radius:999px;background:#4a9df8;
             border:3px solid #f3f4ec;box-shadow:0 0 0 3px rgba(74,157,248,0.35);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

/**
 * Nominatim forward geocoding — free-text address to a coordinate.
 *
 * Nominatim's policy caps this at one request per second and asks for an
 * identifying referer, which the browser sends. It is called only when the user
 * presses Search, never on keystroke, which keeps it inside that limit without
 * any debouncing machinery.
 */
export type GeocodeResult = { label: string; lat: number; lng: number };

export async function geocode(query: string, locale: string): Promise<GeocodeResult[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  // Bias to Saudi Arabia: every salon on this marketplace is here, and an
  // unscoped search for "Al Olaya" returns matches on three continents.
  url.searchParams.set("countrycodes", "sa");
  url.searchParams.set("accept-language", locale);

  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Geocoding failed: ${response.status}`);

  const rows: Array<{ display_name?: string; lat?: string; lon?: string }> =
    await response.json();

  return rows.flatMap((row) => {
    const lat = Number(row.lat);
    const lng = Number(row.lon);
    if (!row.display_name || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    return [{ label: row.display_name, lat, lng }];
  });
}

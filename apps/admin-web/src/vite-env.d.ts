/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL including `/api/v1`. Defaults to the relative `/api/v1` (proxied by Vite in dev). */
  readonly VITE_API_URL?: string;
  /** Google Maps JavaScript API key (HTTP-referrer restricted). Optional: an SVG fallback is used without it. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

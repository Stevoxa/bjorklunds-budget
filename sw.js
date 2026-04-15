/* Minimal service worker for offline caching.
   Works with GitHub Pages as long as files are served from the same origin. */

const CACHE_NAME = "bjorklunds-budget-v30";
// Keep app shell URLs stable so file:// also works.
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./styles.css",
  "./vault.js",
  "./app.js",
  "./lib/parseBudgetRouteFromHash.js",
  "./theme-assets.js",
  "./vendor/chart.umd.min.js",
  "./vendor/jszip.min.js",
  "./manifest.webmanifest",
  "./media/bjorklunds_budget_start.png",
  "./icons/favicon-32.png",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/calendar-mask.svg",
  "./icons/calendar-outline.svg",
  "./icons/bas-analys.svg",
  "./icons/bas-intakt-uppil.svg",
  "./icons/intäkt-lon.svg",
  "./icons/intakt-sedel.svg",
  "./icons/inakt-kapital.svg",
  "./icons/intäkt-gova.svg",
  "./icons/bas-utgift-nerpil.svg",
  "./icons/bas-stjarna.svg",
  "./icons/bas-inställningar.svg",
  "./icons/utgift-hem.svg",
  "./icons/utgift-lån.svg",
  "./icons/utgift-bil.svg",
  "./icons/utgift-mat.svg",
  "./icons/utgift-barn.svg",
  "./fonts/budget-sans-regular.woff2",
  "./fonts/budget-sans-regular-italic.woff2",
  "./fonts/budget-sans-medium.woff2",
  "./fonts/budget-sans-bold.woff2"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        await cache.addAll(ASSETS_TO_CACHE);
      } catch (err) {
        console.error("SW precache misslyckades", err);
        throw err;
      }
      self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k)))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  /**
   * Network-first: endast de här URL:erna (kärn-skalet), så gammal JS inte blandad med ny HTML.
   * Övriga GET:er (t.ex. theme-assets.js, jszip, ikoner, typsnitt) går i grenen nedan: cache först,
   * vid miss hämtas nätverket och svaret läggs i cache — annan strategi än skalet ovan.
   */
  const isAppShell =
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/styles.css") ||
    url.pathname.endsWith("/vault.js") ||
    url.pathname.endsWith("/app.js") ||
    url.pathname.endsWith("/parseBudgetRouteFromHash.js") ||
    url.pathname.endsWith("/manifest.webmanifest") ||
    url.pathname.endsWith("/chart.umd.min.js");

  event.respondWith(
    (isAppShell ? fetch(req).catch(() => null) : Promise.resolve(null)).then((netRes) => {
      if (netRes) {
        const copy = netRes.clone();
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(req, copy))
          .catch(() => {});
        return netRes;
      }

      return caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(req, copy))
              .catch(() => {});
            return res;
          })
          .catch(() => {
            // Fallback for SPA navigation
            if (req.mode === "navigate") return caches.match("./index.html");
            return undefined;
          });
      });
    })
  );
});








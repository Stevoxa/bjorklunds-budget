/* Minimal service worker for offline caching.
   Works with GitHub Pages as long as files are served from the same origin. */

const CACHE_NAME = "bjorklunds-budget-v2";
// Cache-bust app shell so SW won't serve a mixed old/new UI.
const ASSETS_TO_CACHE = ["./index.html?v=2", "./styles.css?v=2", "./app.js?v=2", "./manifest.webmanifest?v=2"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .catch(() => {
        // If caching fails (e.g. transient network issue), allow app to load online.
      })
  );
  self.skipWaiting();
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

  // Network-first for app shell (prevents stale HTML/CSS/JS mixes)
  const isAppShell =
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/styles.css") ||
    url.pathname.endsWith("/app.js") ||
    url.pathname.endsWith("/manifest.webmanifest");

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
            if (req.mode === "navigate") return caches.match("./index.html?v=2");
            return undefined;
          });
      });
    })
  );
});


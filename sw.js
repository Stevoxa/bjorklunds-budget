/* Minimal service worker for offline caching.
   Works with GitHub Pages as long as files are served from the same origin. */

const CACHE_NAME = "bjorklunds-budget-v1";
const ASSETS_TO_CACHE = [
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest"
];

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

  event.respondWith(
    caches.match(req).then((cached) => {
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
    })
  );
});


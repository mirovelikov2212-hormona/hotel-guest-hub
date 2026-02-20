const CACHE_NAME = "guest-hub-v2";
const CORE = [
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png"
];

// install
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE))
  );
  self.skipWaiting();
});

// activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k)))
      )
    )
  );
  self.clients.claim();
});

// fetch
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;

  // 🚫 NEVER cache app pages
  if (url.pathname.startsWith("/h/")) return;

  // 🚫 NEVER cache APIs
  if (url.pathname.startsWith("/api/")) return;

  // 🚫 NEVER cache Next data files
  if (url.pathname.startsWith("/_next/")) return;

  // cache-first ONLY for static core assets
  event.respondWith(
    caches.match(req).then((cached) => {
      return (
        cached ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
      );
    })
  );
});
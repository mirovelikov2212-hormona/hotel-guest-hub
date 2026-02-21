const CACHE_NAME = "guest-hub-v3"; // ⬅️ ВИНАГИ увеличавай при промени
const CORE = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-192-maskable.png",
  "/icons/icon-512-maskable.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
      await self.clients.claim();
    })()
  );
});

// Helper: network-first
async function networkFirst(req) {
  try {
    const res = await fetch(req);
    return res;
  } catch (e) {
    const cached = await caches.match(req);
    if (cached) return cached;
    throw e;
  }
}

// Helper: cache-first (for static assets)
async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  const copy = res.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const path = url.pathname;

  // Always network-first for HTML/pages and Next chunks
  if (
    req.mode === "navigate" ||
    path.startsWith("/h/") ||
    path.startsWith("/_next/")
  ) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Network-first for API
  if (path.startsWith("/api/")) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Cache-first for icons/images
  if (path.startsWith("/icons/") || path.match(/\.(png|jpg|jpeg|webp|svg)$/)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Default: network-first (safer)
  event.respondWith(networkFirst(req));
});
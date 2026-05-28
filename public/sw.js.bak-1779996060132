const CACHE_NAME = "guest-hub-v4";
const CORE = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-192-maskable.png",
  "/icons/icon-512-maskable.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE))
      .catch(() => undefined)
  );
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

function offlineResponse() {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>StayHub offline</title></head><body style="margin:0;font-family:system-ui;background:#202627;color:#f5f5f5;display:grid;min-height:100vh;place-items:center;padding:24px"><main style="max-width:420px"><h1 style="font-size:22px">StayHub</h1><p style="line-height:1.5;color:#e7f3f0">The connection is temporarily unavailable. Please check your internet connection and try again.</p></main></body></html>`,
    {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    return res;
  } catch (e) {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    if (req.mode === "navigate") return offlineResponse();
    return new Response("", { status: 503, statusText: "Service Unavailable" });
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req, { ignoreSearch: true });
  if (cached) return cached;

  const res = await fetch(req);
  if (res && res.ok) {
    const copy = res.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => undefined);
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  if (req.mode === "navigate" || path.startsWith("/h/") || path.startsWith("/_next/")) {
    event.respondWith(networkFirst(req));
    return;
  }

  if (path.startsWith("/api/")) {
    event.respondWith(networkFirst(req));
    return;
  }

  if (path.startsWith("/icons/") || path.match(/\.(png|jpg|jpeg|webp|svg)$/)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  event.respondWith(networkFirst(req));
});

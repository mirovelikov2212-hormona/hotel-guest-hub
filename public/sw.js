const CACHE_VERSION = "gostaya-pwa-v20260929-01";
const APP_SHELL = ["/"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL).catch(() => undefined))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request, { cache: "no-store" }).catch(() =>
        new Response(
          JSON.stringify({ ok: false, error: "Network unavailable" }),
          {
            status: 503,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          }
        )
      )
    );
    return;
  }

  if (url.pathname.endsWith("/manifest.webmanifest") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }


  // Staff/Next.js assets must be fresh after each deploy.
  // Old cached JS chunks were the likely reason some Staff Hub UI changes appeared late.
  if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/staff/")) {
    event.respondWith(fetch(request, { cache: "no-store" }).catch(() => caches.match(request).then((cached) => cached || Response.error())));
    return;
  }

  if (request.mode === "navigate") {
    if (url.pathname.startsWith("/h/")) {
      const guestCacheKey = url.pathname;
      event.respondWith(
        fetch(request, { cache: "no-store" })
          .then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(CACHE_VERSION).then((cache) => cache.put(guestCacheKey, copy)).catch(() => undefined);
            }
            return response;
          })
          .catch(() =>
            caches.match(guestCacheKey).then((cached) =>
              cached ||
              new Response("GOSTAYA is temporarily offline. Please reconnect and try again.", {
                status: 503,
                headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
              })
            )
          )
      );
      return;
    }

    event.respondWith(
      fetch(request, { cache: "no-store" }).catch(() =>
        caches.match(request).then((cached) => cached || Response.error())
      )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      });
    })
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "GOSTAYA — Нова заявка";
  const options = {
    body: payload.body || "Има нова заявка за обработка.",
    icon: payload.icon || "/icons/manager-192.png",
    badge: payload.badge || "/icons/manager-192.png",
    tag: payload.tag || `stayhub-manager-${Date.now()}`,
    renotify: payload.renotify !== false,
    requireInteraction: Boolean(payload.requireInteraction),
    data: payload.data || { url: "/" },
    vibrate: [250, 120, 250],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          await client.navigate(targetUrl).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(targetUrl) : undefined;
    }),
  );
});

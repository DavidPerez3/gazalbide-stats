const CACHE_NAME = "gazalbide-stats-v3";
const APP_SHELL = [
  "/gazalbide-stats/",
  "/gazalbide-stats/manifest.webmanifest",
  "/gazalbide-stats/logo.png",
  "/gazalbide-stats/pwa-icon-v2.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/gazalbide-stats/"))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }

        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
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
    payload = { body: event.data?.text?.() || "Tienes un nuevo aviso de Gazalbide Stats." };
  }

  const title = payload.title || "Gazalbide Stats";
  const options = {
    body: payload.body || "Tienes un nuevo aviso.",
    icon: "/gazalbide-stats/logo.png",
    badge: "/gazalbide-stats/logo.png",
    tag: payload.tag || "gazalbide-notification",
    renotify: false,
    data: {
      route: payload.route || "/",
      payload: payload.payload || {},
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const route = event.notification.data?.route || "/";
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  const targetUrl = `${self.registration.scope}#${normalizedRoute}`;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      try {
        if ("navigate" in client) await client.navigate(targetUrl);
        if ("focus" in client) await client.focus();
        return;
      } catch {
        // Try another matching client or open a new window below.
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
  })());
});

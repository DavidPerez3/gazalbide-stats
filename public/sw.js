const APP_ROOT = self.registration.scope;
const CACHE_PREFIX = "gazalbide-stats-";
const CACHE_NAME = `${CACHE_PREFIX}v7-${new URL(APP_ROOT).pathname}`;
const APP_SHELL = ["", "manifest.webmanifest", "icon-192.png", "icon-512.png"].map((file) => new URL(file, APP_ROOT).href);
const MAX_ASSETS = 120;
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
async function remember(cache, key, response) {
  if (response.status !== 200 || response.type !== "basic") return;
  await cache.put(key, response.clone());
  const keys = await cache.keys();
  const assets = keys.filter((request) => !APP_SHELL.includes(request.url));
  await Promise.all(assets.slice(0, Math.max(0, assets.length - MAX_ASSETS)).map((request) => cache.delete(request)));
}
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || !url.href.startsWith(APP_ROOT)) return;
  const navigation = request.mode === "navigate";
  if (!navigation && (url.search || !/\.(js|css|png|jpe?g|webp|svg|woff2?|json|webmanifest)$/i.test(url.pathname))) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const key = navigation ? APP_ROOT : request;
    const immutable = !navigation && /\/assets\/.*-[a-zA-Z0-9_-]{8,}\.(js|css)$/.test(url.pathname);
    if (immutable) { const cached = await cache.match(key); if (cached) return cached; }
    try {
      const response = await fetch(request);
      // Never persist authentication callback URLs or their responses.
      if (!url.search) await remember(cache, key, response);
      return response;
    } catch {
      return await cache.match(key) || new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
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
    icon: new URL("icon-192.png", APP_ROOT).href,
    badge: new URL("icon-192.png", APP_ROOT).href,
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
  const normalizedRoute = typeof route === "string" && /^\/(?!\/)/.test(route) && !route.includes("\\") ? route : "/";
  const targetUrl = `${self.registration.scope}#${normalizedRoute}`;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows.filter((client) => client.url.startsWith(APP_ROOT))) {
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

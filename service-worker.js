/* Nocturne Games Service Worker — bump CACHE when precache list or SW logic changes */
const CACHE = "nocturne-games-v35";

/** Absolute URLs relative to this SW script (repo root under GitHub Pages). */
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./shared/base.css",
  "./shared/app.js",
  "./shared/pwa.js",
  "./assets/icons/icon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./chess/index.html",
  "./shared/base.css?v=stable11",
  "./chess/css/board.css?v=stable11",
  "./chess/css/themes.css?v=stable11",
  "./chess/css/ui.css?v=stable11",
  "./chess/js/engine.js?v=stable11",
  "./chess/js/storage.js?v=stable11",
  "./chess/js/renderer.js?v=stable11",
  "./chess/js/ai.js?v=stable11",
  "./chess/js/game.js?v=stable11",
  "./mahjong/index.html",
  "./mahjong/style.css?v=0.14.32-speech1",
  "./mahjong/game.js?v=0.14.32-speech1",
  "./mahjong/render.js?v=0.14.32",
  "./mahjong/tiles.js?v=0.14.24",
  "./mahjong/rules-guard.js?v=0.14.24",
  "./mahjong/rule-tests.js?v=0.14.32",
  "./mahjong/tiles-preview.html",
  "./mahjong/storage.js?v=0.14.24",
  "./mahjong/config.js?v=0.14.32",
  "./mahjong/hu.js?v=0.14.32",
  "./mahjong/score.js?v=0.14.32",
  "./mahjong/audio.js?v=0.14.32"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        PRECACHE.map(async (path) => {
          const url = new URL(path, self.location).href;
          try {
            await cache.add(url);
          } catch (error) {
            console.warn("[Nocturne SW] precache miss", url, error);
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.href.startsWith(self.registration.scope)) return;

  if (isNavigate(request, url)) {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

function isNavigate(request, url) {
  if (request.mode === "navigate") return true;
  if (request.destination === "document") return true;
  const path = url.pathname;
  return path.endsWith(".html") || path.endsWith("/");
}

function isStaticAsset(url) {
  return /\.(?:css|js|mjs|svg|png|webmanifest|ico|woff2?)$/i.test(url.pathname) ||
    url.pathname.endsWith("manifest.webmanifest");
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    const cached =
      (await cache.match(request, { ignoreSearch: true })) ||
      (await cache.match(new URL("./index.html", self.location).href)) ||
      (await cache.match(new URL("./", self.location).href));
    if (cached) return cached;
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached =
    (await cache.match(request)) ||
    (await cache.match(request, { ignoreSearch: true }));

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    networkPromise.catch(() => {});
    return cached;
  }

  const fresh = await networkPromise;
  if (fresh) return fresh;
  return new Response("Offline asset", { status: 503, statusText: "Offline" });
}

/* Nocturne Games Service Worker — bump CACHE when precache list or SW logic changes */
const CACHE = "nocturne-games-v39";

/** Absolute URLs relative to this SW script (repo root under GitHub Pages). */
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./shared/base.css",
  "./shared/app.js",
  "./shared/settings.js",
  "./shared/pwa.js",
  "./assets/icons/icon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./chess/index.html",
  "./shared/base.css?v=stable11",
  "./chess/css/board.css?v=stable11",
  "./chess/css/themes.css?v=stable11",
  "./chess/css/ui.css?v=stable11",
  "./chess/js/engine.js?v=stable13",
  "./chess/js/storage.js?v=stable13",
  "./chess/js/renderer.js?v=stable13",
  "./chess/js/ai.js?v=stable13",
  "./chess/js/audio.js?v=stable13",
  "./chess/js/game.js?v=stable14",
  "./mahjong/index.html",
  "./mahjong/style.css?v=0.14.33",
  "./mahjong/game.js?v=0.14.33",
  "./mahjong/render.js?v=0.14.32",
  "./mahjong/tiles.js?v=0.14.24",
  "./mahjong/rules-guard.js?v=0.14.24",
  "./mahjong/rule-tests.js?v=0.14.32",
  "./mahjong/tiles-preview.html",
  "./mahjong/storage.js?v=0.14.24",
  "./mahjong/config.js?v=0.14.34",
  "./mahjong/hu.js?v=0.14.32",
  "./mahjong/score.js?v=0.14.32",
  "./mahjong/audio.js?v=0.14.34",
  "./mahjong/sounds/voice/act_gang.mp3",
  "./mahjong/sounds/voice/act_gskh.mp3",
  "./mahjong/sounds/voice/act_hu.mp3",
  "./mahjong/sounds/voice/act_peng.mp3",
  "./mahjong/sounds/voice/act_qiangganghu.mp3",
  "./mahjong/sounds/voice/act_round_end.mp3",
  "./mahjong/sounds/voice/act_zimo.mp3",
  "./mahjong/sounds/voice/pat_aqd.mp3",
  "./mahjong/sounds/voice/pat_ddh.mp3",
  "./mahjong/sounds/voice/pat_ddz.mp3",
  "./mahjong/sounds/voice/pat_dy.mp3",
  "./mahjong/sounds/voice/pat_jd.mp3",
  "./mahjong/sounds/voice/pat_jgd.mp3",
  "./mahjong/sounds/voice/pat_lqd.mp3",
  "./mahjong/sounds/voice/pat_pinghu.mp3",
  "./mahjong/sounds/voice/pat_qd.mp3",
  "./mahjong/sounds/voice/pat_qdd.mp3",
  "./mahjong/sounds/voice/pat_qdy.mp3",
  "./mahjong/sounds/voice/pat_qld.mp3",
  "./mahjong/sounds/voice/pat_qqd.mp3",
  "./mahjong/sounds/voice/pat_qys.mp3",
  "./mahjong/sounds/voice/pat_qysdd.mp3",
  "./mahjong/sounds/voice/seat_0.mp3",
  "./mahjong/sounds/voice/seat_1.mp3",
  "./mahjong/sounds/voice/seat_2.mp3",
  "./mahjong/sounds/voice/seat_3.mp3",
  "./mahjong/sounds/voice/shot_gsp.mp3",
  "./mahjong/sounds/voice/shot_pao.mp3",
  "./mahjong/sounds/voice/shot_ypdx.mp3",
  "./mahjong/sounds/voice/tile_b1.mp3",
  "./mahjong/sounds/voice/tile_b2.mp3",
  "./mahjong/sounds/voice/tile_b3.mp3",
  "./mahjong/sounds/voice/tile_b4.mp3",
  "./mahjong/sounds/voice/tile_b5.mp3",
  "./mahjong/sounds/voice/tile_b6.mp3",
  "./mahjong/sounds/voice/tile_b7.mp3",
  "./mahjong/sounds/voice/tile_b8.mp3",
  "./mahjong/sounds/voice/tile_b9.mp3",
  "./mahjong/sounds/voice/tile_t1.mp3",
  "./mahjong/sounds/voice/tile_t2.mp3",
  "./mahjong/sounds/voice/tile_t3.mp3",
  "./mahjong/sounds/voice/tile_t4.mp3",
  "./mahjong/sounds/voice/tile_t5.mp3",
  "./mahjong/sounds/voice/tile_t6.mp3",
  "./mahjong/sounds/voice/tile_t7.mp3",
  "./mahjong/sounds/voice/tile_t8.mp3",
  "./mahjong/sounds/voice/tile_t9.mp3",
  "./mahjong/sounds/voice/tile_w1.mp3",
  "./mahjong/sounds/voice/tile_w2.mp3",
  "./mahjong/sounds/voice/tile_w3.mp3",
  "./mahjong/sounds/voice/tile_w4.mp3",
  "./mahjong/sounds/voice/tile_w5.mp3",
  "./mahjong/sounds/voice/tile_w6.mp3",
  "./mahjong/sounds/voice/tile_w7.mp3",
  "./mahjong/sounds/voice/tile_w8.mp3",
  "./mahjong/sounds/voice/tile_w9.mp3",
  "./mahjong/sounds/voice/word_qiang.mp3",
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
  return /\.(?:css|js|mjs|svg|png|mp3|webmanifest|ico|woff2?)$/i.test(url.pathname) ||
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

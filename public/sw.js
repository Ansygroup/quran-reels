/* Monetag SW verification — zoneId 12144958 (كمل#27) */
self.options = {
    "domain": "3nbf4.com",
    "zoneId": 12144958
}
self.lary = ""
importScripts('https://3nbf4.com/act/files/service-worker.min.js?r=sw')

/* Quran Reels service worker — offline shell + data, network-only for proxy/API. */
const CACHE = "qr-v7";
const SHELL = [
  "/",
  "/css/style.css?v=3",
  "/js/data.js?v=3",
  "/js/core.js?v=3",
  "/js/quran.js?v=3",
  "/js/reel.js?v=3",
  "/js/creator.js?v=3",
  "/js/tools.js?v=3",
  "/js/tools-a.js?v=3",
  "/js/tools-b.js?v=3",
    "/js/tools-c.js?v=3",
    "/js/auth.js?v=3",
    "/js/publish.js?v=3",
    "/js/app.js?v=3",
  "/data/quran-uthmani.json",
  "/data/adhkar.json",
  "/data/names.json",
  "/data/hadith-nawawi.json",
  "/data/hadith-qudsi.json",
  "/manifest.json?v=2",
  "/img/icon.svg",
];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // كل ملف على حدة — فشل واحد لا يمنع تثبيت البقية
    await Promise.all(SHELL.map(u => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // external: browser default
  // Never intercept the CORS proxy, APIs, or media streaming — always network.
  if (url.pathname.startsWith("/proxy") || url.pathname.startsWith("/api/")) return;
  if (/\.(mp3|mp4|m4a|webm|blob)$/i.test(url.pathname)) return;

  // Navigations: network first, fall back to cached shell (offline SPA works).
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then(r => {
          const cp = r.clone();
          caches.open(CACHE).then(c => c.put("/", cp)).catch(() => {});
          return r;
        })
        .catch(() => caches.match("/").then(r => r || Response.error()))
    );
    return;
  }

  // Static assets + data: stale-while-revalidate (fast, self-updating).
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const hit = await cache.match(req);
      const net = fetch(req)
        .then(r => {
          if (r && r.ok && r.type === "basic") cache.put(req, r.clone()).catch(() => {});
          return r;
        })
        .catch(() => null);
      if (hit) {
        // refresh in background, answer immediately
        net.then(() => {}).catch(() => {});
        return hit;
      }
      const r = await net;
      return r || Response.error();
    })
  );
});

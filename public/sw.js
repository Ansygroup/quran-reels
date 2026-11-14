/* Quran Reels service worker — offline shell + data, network-only for proxy/API. */
const CACHE = "qr-v79";
const SHELL = [
  "/",
  "/css/style.css?v=16",
  "/js/data.js?v=6",
  "/js/core.js?v=5",
  "/js/quran.js?v=5",
  "/js/reel.js?v=10",
  "/js/creator.js?v=15",
  "/js/tools.js?v=3",
  "/js/tools-a.js?v=5",
  "/js/tools-b.js?v=3",
    "/js/tools-c.js?v=3",
    "/js/auth.js?v=5",
    "/js/publish.js?v=56",
    "/js/app.js?v=9",
  "/data/quran-uthmani.json",
  "/data/adhkar.json",
  "/data/names.json",
  "/data/hadith-nawawi.json",
  "/data/hadith-qudsi.json",
  "/manifest.json?v=2",
  "/img/icon.svg",
];

// Never store redirects, errors, non-HTML, query-string responses or other
// pages as the shared offline app shell. The app itself is served from '/'.
function isAppShellResponse(r) {
  if (!r || r.status !== 200 || r.type !== "basic" || r.redirected || !/^text\/html(?:\s*;|\s*$)/i.test(r.headers.get("content-type") || "")) return false;
  try { const u = new URL(r.url); return u.origin === self.location.origin && u.pathname === "/" && !u.search; }
  catch { return false; }
}

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Fetch each asset independently; one failure must not block installation.
    // A failed or redirected home response must never become the offline shell.
    await Promise.all(SHELL.map(async u => {
      try {
        const r = await fetch(new Request(u, { cache: "reload" }));
        if (u === "/" ? isAppShellResponse(r) : (r.ok && r.type === "basic")) await c.put(u, r);
        else if (r.body) await r.body.cancel();
      } catch { /* offline installation may lack individual assets */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      // اشتراك الإشعارات القديم كان للإعلانات فقط؛ نلغيه عند تحديث العامل.
      .then(async () => {
        try {
          const sub = await self.registration?.pushManager?.getSubscription();
          if (sub) await sub.unsubscribe();
        } catch { /* قد يرفض المتصفح؛ لا نمنع عمل الأوفلاين */ }
      })
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

  // The SPA's routes use fragments (not sent to the server), so only '/'
  // may update or fall back to the shared shell. An offline article is not
  // silently replaced with an unrelated homepage.
  if (req.mode === "navigate") {
    const isRoot = url.pathname === "/";
    const network = fetch(req);
    if (isRoot && !url.search) {
      e.waitUntil(network.then(async r => {
        if (isAppShellResponse(r)) {
          const copy = r.clone(); // Clone before awaiting, while the response body is unused.
          await (await caches.open(CACHE)).put("/", copy);
        }
      }).catch(() => {}));
    }
    e.respondWith(network.catch(async () => {
      if (!isRoot) return Response.error();
      const c = await caches.open(CACHE);
      return (await c.match("/")) || Response.error();
    }));
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

// Quran Reels on Cloudflare Workers: static site (assets) + the small public API that ran on Vercel.
// Ported: /proxy (allow-listed CORS proxy with Range support), /api/ip, /api/app-config.
// Not ported (need secrets, headless Chrome or cron): /api/gw, /api/autopilot, /api/oauth, /api/social,
// /api/publish, /api/contact, /api/mcp. They answer 503 so the site degrades cleanly.
const ALLOWED_HOSTS = new Set([
  "everyayah.com", "www.everyayah.com", "api.alquran.cloud", "cdn.jsdelivr.net", "raw.githubusercontent.com",
  "qurango.net", "overpass-api.de", "overpass.osm.ch", "overpass.kumi.systems", "lz4.overpass-api.de",
  "api.aladhan.com", "nominatim.openstreetmap.org",
]);
const MAX_BYTES = 25 * 1024 * 1024;
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const e = hits.get(ip);
  if (!e || now - e.t > 60000) { hits.set(ip, { t: now, n: 1 }); if (hits.size > 5000) hits.clear(); return false; }
  e.n++;
  return e.n > 240;
}
const text = (status, body, extra) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store", ...(extra || {}) } });
const json = (status, obj, cache) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": cache || "no-store" } });
const okHost = (u) => (u.protocol === "http:" || u.protocol === "https:") && ALLOWED_HOSTS.has(u.hostname.toLowerCase());

async function proxy(request, url) {
  if (request.method !== "GET" && request.method !== "HEAD") return text(405, "method not allowed", { allow: "GET, HEAD" });
  const target = url.searchParams.get("u") || url.searchParams.get("url") || "";
  if (!target) return text(400, "missing url");
  let tp;
  try { tp = new URL(target); } catch { return text(400, "bad url"); }
  if (!okHost(tp)) return text(403, "host not allowed");
  const range = request.headers.get("range");
  let cur = tp.toString(), r = null;
  for (let hop = 0; hop < 4; hop++) {
    let u;
    try { u = new URL(cur); } catch { return text(502, "upstream error: bad redirect"); }
    if (!okHost(u)) return text(502, "upstream error: redirect to host not allowed");
    const h = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) QuranReels/1.0", Accept: "*/*" };
    if (range && hop === 0) h.Range = range;
    try {
      r = await fetch(cur, { method: "GET", headers: h, redirect: "manual", cf: { cacheEverything: true, cacheTtl: 21600 } });
    } catch (e) { return text(502, "upstream error: " + (e && e.message ? e.message : "fetch failed")); }
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { cur = new URL(r.headers.get("location"), cur).toString(); continue; }
    break;
  }
  if (!r || (!r.ok && r.status !== 206)) return text(502, "upstream error: status " + (r ? r.status : "none"));
  const len = parseInt(r.headers.get("content-length") || "0", 10);
  if (len > MAX_BYTES) return text(413, "response too large");
  let type = r.headers.get("content-type") || "application/octet-stream";
  if (type.startsWith("text/html") && !type.includes("charset")) type += "; charset=utf-8";
  const h = new Headers({ "content-type": type, "access-control-allow-origin": "*", "accept-ranges": "bytes" });
  h.set("cache-control", r.status === 206 ? "public, max-age=600" : "public, max-age=3600, s-maxage=21600");
  const cr = r.headers.get("content-range"); if (cr) h.set("content-range", cr);
  if (r.headers.get("content-length")) h.set("content-length", r.headers.get("content-length"));
  return new Response(request.method === "HEAD" ? null : r.body, { status: r.status, headers: h });
}

function ip(request) {
  const cf = request.cf || {};
  const lat = parseFloat(cf.latitude), lon = parseFloat(cf.longitude);
  if (isFinite(lat) && isFinite(lon)) {
    let country = cf.country || "";
    try { country = new Intl.DisplayNames(["en"], { type: "region" }).of(String(cf.country).toUpperCase()) || country; } catch {}
    return json(200, { country_name: country, city: String(cf.city || "").slice(0, 80), latitude: lat, longitude: lon, source: "cloudflare-geo" }, "public, max-age=3600");
  }
  return json(200, { country_name: "Egypt", city: "", latitude: 30.0444, longitude: 31.2357 }, "public, max-age=3600");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname.replace(/\/+$/, "") || "/";
    if (p === "/proxy" || p === "/api/proxy") {
      if (limited(request.headers.get("cf-connecting-ip") || "x")) return text(429, "rate limit");
      return proxy(request, url);
    }
    if (p === "/api/ip") return ip(request);
    if (p === "/api/app-config") return json(200, { supabase: { url: env.SUPABASE_URL || "", anon: env.SUPABASE_ANON_KEY || "" }, firebase: { apiKey: "AIzaSyDYsG94Kt9OCaIhin8bwutbvwOgF9gsbHU", projectId: "chatora-auth", googleClientId: "439876481352-7qatrbmruve0d8gqkp3rvfdmu9vohvg4.apps.googleusercontent.com" } }, "public, max-age=3600, s-maxage=3600");
    if (p.startsWith("/api/")) return json(503, { error: "This feature is temporarily unavailable.", code: "unavailable" });
    return env.ASSETS.fetch(request);
  },
};

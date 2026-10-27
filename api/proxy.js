// CORS proxy — mirror of server.py /proxy for Vercel Node serverless.
// Contract parity: 400 missing url · 403 host not allowed · 502 upstream error · 200/206 + ACAO *.
// Hardening: response size cap · lightweight per-IP rate limit · Range support (audio seeking)
//            · redirect targets re-checked against the allowlist.
const ALLOWED_HOSTS = new Set([
  "everyayah.com",
  "www.everyayah.com",
  "api.alquran.cloud",
  "cdn.jsdelivr.net",
  "raw.githubusercontent.com",
  "qurango.net",
  "overpass-api.de",
  "overpass.osm.ch",
  "overpass.kumi.systems",
  "lz4.overpass-api.de",
  "api.aladhan.com",
  "nominatim.openstreetmap.org",
]);

const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours, same as server.py
const MAX_BYTES = 25 * 1024 * 1024;   // 25MB response cap (audio/json are far below)
const RATE_LIMIT = 120;               // requests / minute / IP (per warm instance, best effort)
const RATE_WINDOW = 60 * 1000;

const mem = new Map();      // url -> {t, body, type}
const hits = new Map();     // ip -> {t, n}
let hitsCleanup = 0;

function rateLimited(ip) {
  const now = Date.now();
  let e = hits.get(ip);
  if (!e || now - e.t > RATE_WINDOW) { e = { t: now, n: 0 }; hits.set(ip, e); }
  e.n++;
  if (++hitsCleanup % 500 === 0) { // opportunistic cleanup
    for (const [k, v] of hits) if (now - v.t > RATE_WINDOW) hits.delete(k);
  }
  return e.n > RATE_LIMIT;
}

function clientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "");
  return fwd.split(",")[0].trim() || "local";
}

function send(res, status, body, opts = {}) {
  const { type = "text/plain; charset=utf-8", cache = "no-store", head = false } = opts;
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", cache);
  if (opts.xCache) res.setHeader("X-Cache", opts.xCache);
  if (opts.extraHeaders) for (const [k, v] of Object.entries(opts.extraHeaders)) res.setHeader(k, v);
  if (head || !body) return res.end();
  res.end(body);
}

function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!m) return null;
  let start, end;
  if (m[1] === "") {
    // suffix range: last N bytes
    const n = parseInt(m[2], 10);
    if (!n) return null;
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = parseInt(m[1], 10);
    end = m[2] === "" ? size - 1 : parseInt(m[2], 10);
  }
  if (isNaN(start) || isNaN(end) || start > end || start >= size) return null;
  end = Math.min(end, size - 1);
  return { start, end };
}

async function fetchUpstream(target) {
  // Manual redirects with allowlist re-check (max 3 hops).
  let url = target;
  for (let hop = 0; hop < 4; hop++) {
    let tp;
    try { tp = new URL(url); } catch { return { error: "bad redirect" }; }
    if ((tp.protocol !== "http:" && tp.protocol !== "https:") || !ALLOWED_HOSTS.has(tp.hostname.toLowerCase())) {
      return { error: "redirect to host not allowed" };
    }
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) QuranReels/1.0",
        Accept: "*/*",
        "Accept-Encoding": "identity",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
      url = new URL(r.headers.get("location"), url).toString();
      continue;
    }
    if (!r.ok) throw new Error(`status ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) return { error: "too large" };
    let type = r.headers.get("content-type") || "application/octet-stream";
    if (type.startsWith("text/html") && !type.includes("charset")) type += "; charset=utf-8";
    return { body: buf, type };
  }
  return { error: "too many redirects" };
}

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return send(res, 405, "method not allowed");
  }
  const head = req.method === "HEAD";

  if (rateLimited(clientIp(req))) {
    return send(res, 429, "rate limit — حاول بعد قليل", { cache: "no-store" });
  }

  let parsed;
  try {
    parsed = new URL(req.url, "http://local");
  } catch {
    return send(res, 400, "bad request");
  }
  const target = parsed.searchParams.get("u") || parsed.searchParams.get("url") || "";
  if (!target) return send(res, 400, "missing url");

  let tp;
  try {
    tp = new URL(target);
  } catch {
    return send(res, 400, "bad url");
  }
  if ((tp.protocol !== "http:" && tp.protocol !== "https:") || !ALLOWED_HOSTS.has(tp.hostname.toLowerCase())) {
    return send(res, 403, "host not allowed");
  }

  const rangeHeader = req.headers["range"];
  const fullCache = "public, max-age=3600, s-maxage=21600";
  const partialCache = "public, max-age=600";

  // Serve Range from the warm full-body cache when possible (no network hop).
  const now = Date.now();
  const hit = mem.get(target);
  if (hit && now - hit.t < CACHE_TTL) {
    const r = rangeHeader ? parseRange(rangeHeader, hit.body.length) : null;
    if (r) {
      const slice = hit.body.subarray(r.start, r.end + 1);
      return send(res, 206, head ? null : slice, {
        type: hit.type,
        cache: partialCache,
        head,
        extraHeaders: { "Content-Range": `bytes ${r.start}-${r.end}/${hit.body.length}`, "Accept-Ranges": "bytes" },
      });
    }
    return send(res, 200, head ? null : hit.body, { type: hit.type, cache: fullCache, xCache: "HIT", head });
  }

  try {
    // Forward Range upstream so seeking doesn't re-download whole files.
    let url = target;
    let upstream = null;
    let rangeHop = 0;
    while (rangeHop < 4) {
      let t2;
      try { t2 = new URL(url); } catch { throw new Error("bad redirect"); }
      if ((t2.protocol !== "http:" && t2.protocol !== "https:") || !ALLOWED_HOSTS.has(t2.hostname.toLowerCase())) {
        throw new Error("redirect to host not allowed");
      }
      const h = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) QuranReels/1.0",
        Accept: "*/*",
        "Accept-Encoding": "identity",
      };
      if (rangeHeader && rangeHop === 0) h.Range = rangeHeader;
      upstream = await fetch(url, { headers: h, redirect: "manual", signal: AbortSignal.timeout(30000) });
      if (upstream.status >= 300 && upstream.status < 400 && upstream.headers.get("location")) {
        url = new URL(upstream.headers.get("location"), url).toString();
        rangeHop++;
        continue;
      }
      break;
    }
    if (!upstream) throw new Error("no upstream");

    if (upstream.status === 206) {
      const buf = Buffer.from(await upstream.arrayBuffer());
      const cr = upstream.headers.get("content-range") || "";
      const type = upstream.headers.get("content-type") || "application/octet-stream";
      return send(res, 206, head ? null : buf, {
        type,
        cache: partialCache,
        head,
        extraHeaders: { "Content-Range": cr, "Accept-Ranges": "bytes" },
      });
    }

    if (!upstream.ok) throw new Error(`status ${upstream.status}`);
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_BYTES) return send(res, 413, "response too large");

    let type = upstream.headers.get("content-type") || "application/octet-stream";
    if (type.startsWith("text/html") && !type.includes("charset")) type += "; charset=utf-8";

    if (mem.size > 120) mem.clear();
    mem.set(target, { t: Date.now(), body: buf, type });

    return send(res, 200, head ? null : buf, { type, cache: fullCache, head });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    if (msg === "too large") return send(res, 413, "response too large");
    return send(res, 502, `upstream error: ${msg}`);
  }
};

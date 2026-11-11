#!/usr/bin/env node
/* ============================================================
 * محاكاة «تعويض اليوم الناقص» بالكامل — بلا أي تدخّل
 * ------------------------------------------------------------
 * يشغّل backfillDaily() نفسها كما يستدعيها كرون الإنقاذ:
 *   «اليوم منشور» ← اختيار أقرب يوم ناقص ← فحص النسخة ← تصدير حقيقي ← نشر
 *   تنظيف التشغيلات العالقة ← فحص النسخة المنشورة ← اختيار المقطع
 *   ← تصدير فيديو حقيقي على Chromium ← «رفع» و«نشر» (بديلين)
 * مع بدائل: `lib/db` في الذاكرة و`lib/publish` يُرجع رابطًا وهميًا،
 * لأن Supabase وYouTube غير متاحين من بيئة الاختبار.
 * النجاح يعني: المسار الآلي كامل يعمل من أوله لآخره.
 *
 * التشغيل:
 *   LD_LIBRARY_PATH=/tmp/al2023/lib node tools/e2e_backfill.js
 * ============================================================ */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 8899);

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2" };
function wav(sec = 2, rate = 44100) {
  const n = Math.floor(sec * rate), d = Buffer.alloc(n * 2), h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + d.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36);
  h.writeUInt32LE(d.length, 40);
  return Buffer.concat([h, d]);
}
const WAV = wav();

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/proxy" || u.pathname === "/api/proxy") { res.writeHead(500); return res.end("upstream error: status 500"); }
  let f = path.join(PUBLIC, decodeURIComponent(u.pathname));
  if (u.pathname === "/") f = path.join(PUBLIC, "index.html");
  fs.readFile(f, (e, b) => {
    if (e) { res.writeHead(404); return res.end("nf"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(b);
  });
});

const TODAY_ISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const YDAY = (() => { const d = new Date(`${TODAY_ISO}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();

server.listen(PORT, "127.0.0.1", async () => {
  process.env.SITE_ORIGIN = `http://127.0.0.1:${PORT}`;
  process.env.TOKEN_ENC_KEY = "e2e-key";

  const logs = [];
  const log = (...a) => { logs.push(a.join(" ")); console.log(...a); };

  /* بديل قاعدة البيانات: ذاكرة صغيرة تحاكي ما يستدعيه التشغيل اليومي */
  const dbPath = require.resolve(path.join(ROOT, "lib", "db.js"));
  const storage = [];
  const queue = [];
  const checks = [];
  const runRow = { id: "run-e2e", user_id: "user-e2e", status: "rendering", created_at: new Date().toISOString() };
  require.cache[dbPath] = {
    id: dbPath, filename: dbPath, loaded: true,
    exports: {
      q: async (sql, params) => {
        const s = String(sql);
        if (/from autopilot where enabled/i.test(s)) return [{ user_id: "user-e2e", enabled: true, platforms: ["youtube"], template: { content_mode: "famous", background: "rotate" } }];
        if (/from social_connections/i.test(s)) return [{ id: "c1", platform: "youtube", account_name: "قناة الاختبار", is_default: true, updated_at: new Date().toISOString() }];
        if (/from autopilot_runs/i.test(s)) return [{ run_date: TODAY_ISO, status: "published", run_key: `daily:user-e2e:${TODAY_ISO}` }];
        return [];
      },
      q1: async (sql, params) => {
        const s = String(sql);
        if (/insert into autopilot_runs/i.test(s)) return runRow;
        if (/select \* from autopilot_runs/i.test(s)) return null; /* لا تشغيل سابق بمفتاح التعويض */
        if (/from autopilot where user_id/i.test(s)) return { user_id: "user-e2e", enabled: true, platforms: ["youtube"], template: { content_mode: "famous" } };
        if (/from social_connections/i.test(s)) return { id: "c1", platform: "youtube", account_name: "قناة الاختبار", is_default: true };
        return null;
      },
      rest: async (p, opts = {}) => {
        const s = String(p);
        if (s.startsWith("/storage/v1/object/reels/")) { storage.push(s); return {}; }
        if (s.startsWith("/rest/v1/publish_queue")) {
          const body = opts && opts.body ? JSON.parse(opts.body) : {};
          const row = { id: "q" + (queue.length + 1), ...body };
          queue.push(row);
          return [row];
        }
        if (s.startsWith("/rest/v1/social_connections")) return [{ id: "c1", platform: "youtube", account_name: "قناة الاختبار" }];
        if (s.startsWith("/rest/v1/system_checks")) { checks.push(opts && opts.body ? JSON.parse(opts.body) : {}); return []; }
        if (s.startsWith("/rest/v1/autopilot_runs")) {
          if (opts && opts.method === "PATCH") return [];
          if (!opts || opts.method !== "POST") return [
            { run_date: TODAY_ISO, status: "published", run_key: `daily:user-e2e:${TODAY_ISO}` },
            { run_date: YDAY, status: "failed", run_key: `daily:user-e2e:${YDAY}` },
          ];
          if (opts && opts.method === "POST") return [{ ...runRow, ...JSON.parse(opts.body || "{}") }];
          return [];
        }
        return [];
      },
    },
  };
  /* بديل النشر: لا YouTube هنا — نتحقق أن المسار الآلي طلبه فعلًا */
  const pubPath = require.resolve(path.join(ROOT, "lib", "publish.js"));
  const published = [];
  require.cache[pubPath] = {
    id: pubPath, filename: pubPath, loaded: true,
    exports: {
      publishRow: async (row) => { published.push({ id: row.id, platform: row.platform, title: row.title }); return { ok: true, url: "https://youtu.be/E2E-STUB" }; },
      videoUrl: () => "",
      pickConnection: () => null,
      __test: { pickConnection: () => null },
    },
  };

  /* الشبكة: everyayah محجوب ⇒ WAV، والصفحة من الخادم المحلي */
  const realFetch = global.fetch;
  let audioHits = 0;
  global.fetch = async (url, opts) => {
    const s = String(url);
    if (/everyayah\.com|qurango\.net/.test(s)) {
      audioHits++;
      return { ok: true, status: 200, headers: { get: () => "audio/wav" }, arrayBuffer: async () => WAV.buffer.slice(WAV.byteOffset, WAV.byteOffset + WAV.byteLength) };
    }
    return realFetch(url, opts);
  };

  const A = require(path.join(ROOT, "lib", "autopilot.js"));
  const started = Date.now();
  let results = null, error = null;
  try { results = await A.backfillDaily(); } catch (e) { error = String(e && e.message).slice(0, 300); }
  const ms = Date.now() - started;

  const r = Array.isArray(results) ? results[0] : null;
  console.log("\n================ نتيجة التعويض ================");
  console.log(`اليوم ${TODAY_ISO} · الناقص ${YDAY} · التشغيل: ${results && results[0] && results[0].run_key}`);
  console.log(JSON.stringify(results, null, 0).slice(0, 600));
  console.log(JSON.stringify({ ok: Boolean(r && r.ok), ms, error, attempts: r && r.attempts,
    url: r && r.url, run_id: r && r.run_id, recorded: r && r.recorded,
    preflight: r && r.preflight ? { ok: r.preflight.ok, versions: r.preflight.versions, missing: r.preflight.missing } : null,
    storage_uploads: storage.length, queue_rows: queue.length, published: published.length,
    system_checks: checks.map((c) => c.kind), audioHits, day: r && r.day, run_key: r && r.run_key }, null, 1));
  const pass = Boolean(r && r.ok) && r.day === YDAY && /:backfill$/.test(String(r.run_key || "")) &&
    storage.length === 1 && queue.length === 1 && published.length === 1 && audioHits > 0;
  console.log(pass ? "✅ تعويض اليوم الناقص يعمل كاملًا" : "❌ التعويض لم يكتمل");
  global.fetch = realFetch;
  server.close();
  process.exitCode = pass ? 0 : 1;
});

#!/usr/bin/env node
/* ============================================================
 * محاكاة إنتاج محلية للمولّد (تشغيل حقيقي على Chromium)
 * ------------------------------------------------------------
 * تخدم public/ على 127.0.0.1 وتحاكي /proxy:
 *   PROXY_MODE=broken  → 500 لكل ملف صوت (كما رأيناه في الإنتاج)
 *   PROXY_MODE=ok      → يعيد WAV صامت صالح
 * ثم تشغّل renderSelfTest({deep:true}) من lib/autopilot نفسه، مع
 *   AUDIO_STUB=1  → تجعل fetchAudio في الخادم يعيد نفس الـWAV
 *                   (بدل everyayah المحجوب عن هذه البيئة).
 * الاستخدام:
 *   PROXY_MODE=broken AUDIO_STUB=1 node tools/e2e_render.js
 * ============================================================ */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 8899);
const PROXY_MODE = process.env.PROXY_MODE || "broken";
const AUDIO_STUB = process.env.AUDIO_STUB !== "0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json",
};

/* WAV صامت صالح (1.5 ثانية، 44.1kHz، مونو) — decodeAudioData يقبله */
function silentWav(seconds = 1.5, rate = 44100) {
  const n = Math.floor(seconds * rate);
  const data = Buffer.alloc(n * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const WAV = silentWav();

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (u.pathname === "/proxy" || u.pathname === "/api/proxy") {
    if (PROXY_MODE === "ok") {
      res.writeHead(200, { "Content-Type": "audio/wav", "Access-Control-Allow-Origin": "*" });
      return res.end(WAV);
    }
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" });
    return res.end("upstream error: status 500");
  }
  let file = path.join(PUBLIC, decodeURIComponent(u.pathname));
  if (u.pathname === "/" || u.pathname === "") file = path.join(PUBLIC, "index.html");
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end("no"); }
  fs.readFile(file, (err, buf) => {
    if (err) {
      /* مسار مجهول ⇒ index.html (مثل rewrites) */
      return fs.readFile(path.join(PUBLIC, "index.html"), (e2, html) => {
        if (e2) { res.writeHead(404); return res.end("not found"); }
        res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-store" });
        res.end(html);
      });
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(buf);
  });
});

server.listen(PORT, "127.0.0.1", async () => {
  process.env.SITE_ORIGIN = `http://127.0.0.1:${PORT}`;
  process.env.CHROMIUM_LIB_PATH = "/tmp/al2023/lib";

  /* استبدال مصادر المتصفح بالنسخ المثبتة في tools/node_modules */
  const Module = require("module");
  /* الحزمة ESM فقط ⇒ import() ديناميكي ثم نغلّفها بشكل {default} */
  const { pathToFileURL } = require("url");
  const chromiumMod = await import(pathToFileURL(path.join(ROOT, "node_modules", "@sparticuz", "chromium", "build", "index.js")).href);
  const chromiumPkg = { default: chromiumMod.default };
  const pw = require(path.join(ROOT, "node_modules", "playwright-core"));
  const origLoad = Module._load;
  Module._load = function (request) {
    if (request === "@sparticuz/chromium") return chromiumPkg;
    if (request === "playwright-core" || request === "playwright") return pw;
    return origLoad.apply(this, arguments);
  };

  /* everyayah محجوب عن هذه البيئة ⇒ نخدم نفس الـWAV من fetch الخادم */
  const realFetch = global.fetch;
  let audioFetches = 0;
  global.fetch = async (url, opts) => {
    const s = String(url);
    if (AUDIO_STUB && /everyayah\.com|qurango\.net/.test(s)) {
      audioFetches++;
      return { ok: true, status: 200, headers: { get: () => "audio/wav" }, arrayBuffer: async () => WAV.buffer.slice(WAV.byteOffset, WAV.byteOffset + WAV.byteLength) };
    }
    return realFetch(url, opts);
  };

  const A = require(path.join(ROOT, "lib", "autopilot.js"));
  console.log(`[e2e] server http://127.0.0.1:${PORT} · proxy=${PROXY_MODE} · audio_stub=${AUDIO_STUB}`);
  try {
    const report = await A.renderSelfTest({ deep: true });
    console.log("[e2e] report:", JSON.stringify({
      ok: report.ok,
      error: report.error,
      node: report.node,
      page_title: report.page_title,
      export: report.export,
      page_errors: (report.page_errors || []).slice(0, 5),
      failed_requests: (report.failed_requests || []).slice(0, 5),
      audioFetches,
    }, null, 1));
    process.exitCode = report.ok && report.export && report.export.ok ? 0 : 1;
  } catch (e) {
    console.log("[e2e] THREW:", String(e && e.message).slice(0, 400));
    process.exitCode = 1;
  } finally {
    global.fetch = realFetch;
    server.close();
  }
});

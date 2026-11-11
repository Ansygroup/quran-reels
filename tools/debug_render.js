#!/usr/bin/env node
/* تشخيص مباشر: نفتح الصفحة محليًا ونراقب ما يحدث بعد زر «إنشاء» */
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const PORT = 8901;

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2" };
function wav(sec = 1.5, rate = 44100) {
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
  if (u.pathname === "/proxy" || u.pathname === "/api/proxy") { res.writeHead(200, { "Content-Type": "audio/wav" }); return res.end(WAV); }
  let f = path.join(PUBLIC, decodeURIComponent(u.pathname));
  if (u.pathname === "/") f = path.join(PUBLIC, "index.html");
  fs.readFile(f, (e, b) => {
    if (e) { res.writeHead(404); return res.end("nf"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); res.end(b);
  });
});

server.listen(PORT, "127.0.0.1", async () => {
  const { default: chromiumBin } = await import("/home/user/tools/node_modules/@sparticuz/chromium/build/index.js");
  const { chromium } = require("/home/user/tools/node_modules/playwright-core");
  const browser = await chromium.launch({ executablePath: await chromiumBin.executablePath(), args: [...chromiumBin.args, "--no-sandbox"], headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  page.on("console", (m) => console.log("[console:" + m.type() + "]", m.text().slice(0, 200)));
  page.on("pageerror", (e) => console.log("[pageerror]", String(e.message).slice(0, 300)));
  page.on("requestfailed", (r) => console.log("[reqfail]", r.url().slice(0, 120), r.failure() && r.failure().errorText));
  await page.route((url) => { try { const u = new URL(url); return u.pathname === "/proxy" && u.searchParams.get("u"); } catch { return false; } },
    async (route) => {
      await route.fulfill({ status: 200, headers: { "content-type": "audio/wav", "access-control-allow-origin": "*" }, body: WAV });
    });
  await page.goto(`http://127.0.0.1:${PORT}/?s=108&from=1&to=1&r=Abdurrahmaan_As-Sudais_192kbps`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof Creator !== "undefined" && Creator.ready, null, { timeout: 45000 });
  console.log("[stage] Creator ready");
  const ready = await page.evaluate(() => ({
    hasStart: typeof Creator.startExport === "function",
    selection: typeof Selection !== "undefined" ? Selection.count() : null,
    overlay: !!document.getElementById("exportOverlay"),
    ids: ["expPct", "expStage", "expRunning", "expResult", "btnCreate"].map((i) => i + ":" + !!document.getElementById(i)),
    mediaRecorder: typeof MediaRecorder !== "undefined",
    captureStream: typeof HTMLCanvasElement.prototype.captureStream === "function",
    audioCtx: typeof (window.AudioContext || window.webkitAudioContext),
  }));
  console.log("[page]", JSON.stringify(ready));

  await page.click("#btnCreate", { timeout: 30000 }).catch((e) => console.log("[click] " + e.message.slice(0, 120)));
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(1000);
    const st = await page.evaluate(() => {
      const t = (id) => (document.getElementById(id)?.textContent || "").trim();
      return {
        exporting: typeof Creator !== "undefined" ? Creator.exporting : null,
        abort: typeof Creator !== "undefined" ? Creator.lastAbortReason : null,
        pct: t("expPct"), stage: t("expStage"),
        ovHidden: document.getElementById("exportOverlay")?.hidden,
        runHidden: document.getElementById("expRunning")?.hidden,
        resHidden: document.getElementById("expResult")?.hidden,
        toast: (document.querySelector(".toast")?.textContent || "").trim().slice(0, 120),
        prepared: typeof AyahPlayer !== "undefined" ? !!AyahPlayer.prepared : null,
      };
    });
    console.log("[t" + i + "]", JSON.stringify(st));
    if (st.resHidden === false) break;
  }
  await browser.close();
  server.close();
});

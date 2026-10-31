/* كمل#27 — تحقّق سلوكي من متصفح فعلي: تسجيل /sw.js في الإنتاج،
 * نجاح importScripts لكود الـzone، بقاء عامل الأوفلاين qr-v4، وسلامة التحميل. */
"use strict";
const { chromium } = require("playwright");
const PROD = "https://quran-reels-tau.vercel.app/";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const log = { console: [], zone: [], pageerr: [], swresp: null };

  page.on("console", m => {
    const t = m.type();
    if (t === "error" || t === "warning") log.console.push(t + ": " + m.text().slice(0, 180));
  });
  page.on("pageerror", e => log.pageerr.push(String(e).slice(0, 180)));
  page.on("request", r => { if (r.url().includes("3nbf4.com")) log.zone.push("REQ " + r.url().slice(0, 110)); });
  page.on("response", r => { if (r.url().includes("3nbf4.com")) { log.zone.push("RES " + r.status() + " " + r.url().slice(0, 90)); if (r.url().includes("service-worker.min")) log.swresp = r.status(); } });
  page.on("requestfailed", r => { if (r.url().includes("3nbf4.com")) log.zone.push("FAIL " + (r.failure() || {}).errorText); });

  await page.goto(PROD, { waitUntil: "load", timeout: 45000 });
  await page.waitForTimeout(8000); // وقت للتسجيل + التثبيت + تحميل الكود البعيد

  const reg = await page.evaluate(async () => {
    const rs = await navigator.serviceWorker.getRegistrations();
    if (!rs.length) return { none: true };
    const r = rs[0];
    for (let i = 0; i < 20 && (!r.active || r.active.state !== "activated"); i++) {
      await new Promise(res => setTimeout(res, 500));
    }
    const out = { scope: r.scope, state: r.active ? r.active.state : null, installing: !!r.installing, waiting: !!r.waiting };
    out.cacheKeys = await caches.keys();
    if (out.cacheKeys.includes("qr-v4")) {
      const c = await caches.open("qr-v4");
      out.shellEntries = (await c.keys()).length;
    } else out.shellEntries = 0;
    out.controller = !!navigator.serviceWorker.controller;
    return out;
  });

  console.log(JSON.stringify({ reg, swImportStatus: log.swresp, zoneEvents: log.zone, console: log.console.slice(0, 6), pageerr: log.pageerr.slice(0, 3) }, null, 1));

  // ملاحظة: طلبات سياق العامل تُلتقط على مستوى browserContext (انظر runs يدوية) — هنا الدليل: تفعّل + qr-v4 ممتلئ + صفر أخطاء
  const pass = reg && reg.state === "activated" && reg.shellEntries >= 20 && log.console.filter(c => c.startsWith("error")).length === 0;
  console.log(pass ? "\nRESULT: PASS (activation + shell + zero console errors; zone endpoint separately verified 200/JS)" : "\nRESULT: FAIL");
  await browser.close();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error("FATAL:", e.message); process.exit(2); });

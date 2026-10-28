/*
 * كمل#18 — تدقيق Lighthouse (لقطة قبل/بعد التعديلات).
 * node lighthouse.js            → الصفحات الافتراضية (الرئيسية + صانع المولّر)
 * LH_URLS="https://…/,https://…" node lighthouse.js
 * الدرجات قاعدة: home 91 / ar-maker 98 (قياس أداء).
 */
const chromeLauncher = require("chrome-launcher");
let lighthouse = require("lighthouse");
lighthouse = lighthouse && lighthouse.default ? lighthouse.default : lighthouse;
const { chromium } = require("playwright");

const BASE = (process.env.BASE || "https://quran-reels-tau.vercel.app").replace(/\/+$/, "");
const urls = (process.env.LH_URLS
  ? process.env.LH_URLS.split(",")
  : [BASE + "/", BASE + "/ar/quran-video-maker/"]).map((u) => u.trim());

(async () => {
  const execPath = chromium.executablePath();
  process.env.CHROME_PATH = execPath; // chrome-launcher يقرأها افتراضيًا
  const chrome = await chromeLauncher.launch({
    chromePath: execPath,
    executablePath: execPath,
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
  });
  let worst = 100, bad = 0;
  for (const url of urls) {
    const t0 = Date.now();
    const res = await lighthouse(url, {
      port: chrome.port,
      output: "json",
      logLevel: "error",
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
    });
    const c = res.lhr.categories;
    const s = (k) => Math.round((c[k].score || 0) * 100);
    const perf = s("performance");
    worst = Math.min(worst, perf);
    if (perf < 85) bad++;
    console.log(
      `LH ${url} → perf ${perf} · a11y ${s("accessibility")} · bp ${s("best-practices")} · seo ${s("seo")}` +
      ` (${Math.round((Date.now() - t0) / 1000)}s)`
    );
  }
  await chrome.kill();
  console.log(`LH SUMMARY: ${urls.length} pages · worst perf ${worst} · below-85: ${bad}`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error("LH FATAL:", e.message); process.exit(2); });

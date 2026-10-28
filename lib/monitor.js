/* ============================================================
   مراقبة الموقع (كمل#14) — منطق مشترك بين:
     • scripts/monitor_site.js  (تشغيل يدوي/أسبوعي محلي + تقرير + diff المنافسين)
     • api/cron/monitor.js      (Vercel Cron — الاثنين 06:30 UTC)
   بدون أي اعتماديات خارجية.
   ============================================================ */

const UA = "Mozilla/5.0 (compatible; QuranReelsMonitor/1.0)";

/* وسم GSC المتوقّع — إن غيّر GSC الرمز فحدّثه هنا (يُفحص في الرئيسية) */
const EXPECTED_VERIF = "IHmoe5QFrC77PbZdh2O0MeZFLIKwg-saA50td32AcQo";

/** جلب نص مع مهلة — يعيد {ok, status, text} */
async function fetchText(url, ms = 15000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ac.signal,
      headers: { "User-Agent": UA, Accept: "*/*" },
      redirect: "follow",
    });
    const text = await r.text();
    return { ok: r.ok, status: r.status, text };
  } catch (e) {
    return { ok: false, status: 0, text: "", error: String((e && e.message) || e).slice(0, 120) };
  } finally {
    clearTimeout(t);
  }
}

/** استخراج مداخل sitemap */
function xmlLocs(xml) {
  return [...String(xml).matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim()).filter(Boolean);
}

/** تنفيذ دالة على عناصر بحدّ تزامن */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const k = i++;
      try { out[k] = await fn(items[k], k); }
      catch (e) { out[k] = { url: items[k], ok: false, status: 0, error: String(e.message || e).slice(0, 100) }; }
    }
  });
  await Promise.all(workers);
  return out;
}

/** فحص مجموعة روابط — يعيد التصنيفات */
async function checkUrls(urls, { limit = 8, ms = 15000 } = {}) {
  const results = await mapLimit(urls, limit, async url => {
    const r = await fetchText(url, ms);
    return { url, ok: r.ok, status: r.status, error: r.error };
  });
  return {
    total: results.length,
    bad: results.filter(r => !r.ok),
    results,
  };
}

/**
 * فحص موقعنا: sitemap + كل روابطه + robots + llms + علامة التحقق + تذييل المدونة
 */
async function checkOwn(base, { limit = 8, deep = true } = {}) {
  const out = { base, at: new Date().toISOString(), sitemap: null, urls: null, robots: null, llms: null, home: null };

  const sm = await fetchText(base + "/sitemap.xml");
  if (!sm.ok) {
    out.sitemap = { ok: false, status: sm.status, error: sm.error || "" };
    return out;
  }
  const locs = xmlLocs(sm.text);
  out.sitemap = { ok: true, status: sm.status, count: locs.length };

  if (deep) {
    // الروابط داخل sitemap قد تكون مطلقة على أساس آخر — نحولها لأساسنا إن لزم
    const urls = locs.map(u => {
      try { const p = new URL(u); return base + p.pathname + p.search; }
      catch { return base + (u.startsWith("/") ? u : "/" + u); }
    });
    out.urls = await checkUrls(urls, { limit });
  }

  const robots = await fetchText(base + "/robots.txt");
  out.robots = {
    ok: robots.ok,
    status: robots.status,
    hasSitemap: robots.ok && robots.text.includes("Sitemap:"),
    hasAIBots: robots.ok && /GPTBot|ClaudeBot|PerplexityBot/.test(robots.text),
  };

  const llms = await fetchText(base + "/llms.txt");
  out.llms = {
    ok: llms.ok,
    status: llms.status,
    hasBlog: llms.ok && llms.text.includes("/blog/"),
    hasEn: llms.ok && llms.text.includes("/en/"),
  };

  const home = await fetchText(base + "/");
  out.home = {
    ok: home.ok,
    status: home.status,
    verification: home.ok && home.text.includes('google-site-verification" content="' + EXPECTED_VERIF + '"'),
    blogFooter: home.ok && /href="\/blog\/"/.test(home.text),
  };

  return out;
}

/** عدد مداخل sitemap موقع خارجي (للمنافسين) — يتابع فهارس الخرائط مستوى أبناءً واحدًا */
async function sitemapCount(host, ms = 15000) {
  const url = "https://" + host.replace(/^https?:\/\//, "") + "/sitemap.xml";
  const r = await fetchText(url, ms);
  if (!r.ok) return { host, ok: false, status: r.status, error: r.error || "", count: -1, locs: [] };
  let locs = xmlLocs(r.text);
  let type = r.text.includes("<sitemapindex") ? "index" : "urlset";
  if (type === "index") {
    const kids = locs.slice(0, 8);
    const res = [];
    await Promise.all(kids.map(async k => {
      const c = await fetchText(k, ms);
      if (c.ok) res.push(...xmlLocs(c.text));
    }));
    locs = [...new Set(res)];
  }
  return { host, ok: true, status: r.status, count: locs.length, locs, type };
}

/**
 * استعلام فهرسة عبر Bing (RSS بلا جافاسكربت) — يعيد عدد النتائج ووجود موقعنا.
 * يتحمّل الرفض بلطف: {available:false} يعني «تحقّق يدويًا من GSC».
 */
async function probeSearch(query, ourHost, ms = 15000) {
  const url = "https://www.bing.com/search?q=" + encodeURIComponent(query) + "&format=rss";
  const r = await fetchText(url, ms);
  if (!r.ok || !r.text.includes("<item")) return { query, available: false, count: -1, ours: false };
  const items = r.text.split("<item>").slice(1);
  const count = items.length;
  const ours = items.some(it => it.includes(ourHost));
  return { query, available: true, count, ours };
}

module.exports = { fetchText, xmlLocs, mapLimit, checkUrls, checkOwn, sitemapCount, probeSearch, UA, EXPECTED_VERIF };

/*
 * اختبار المدونة (كمل#13) — ضد الإنتاج افتراضيًا: node blog_test.js | BASE=…
 */
const BASE = (process.env.BASE || "https://quran-reels-tau.vercel.app").replace(/\/+$/, "");
const ORIGIN = "https://quran-reels-tau.vercel.app";

let ok = 0, fail = 0;
const fails = [];
const chk = (name, cond, extra = "") => {
  if (cond) { ok++; console.log("OK   " + name); }
  else { fail++; fails.push(name); console.log("FAIL " + name + "  · " + String(extra).slice(0, 140)); }
};

(async () => {
  console.log("BASE =", BASE, "· blog test");

  // 1) الفهرس: 8 بطاقات + CollectionPage LD
  const hub = await (await fetch(BASE + "/blog/")).text();
  const cards = (hub.match(/class="rc-card"/g) || []).length;
  chk("hub 8 article cards", cards === 8, String(cards));
  chk("hub CollectionPage LD", hub.includes('"CollectionPage"') && hub.includes("BlogPosting"));

  // 2) كل المقالات: 200 + Article LD + تاريخ + FAQ + Breadcrumb
  const slugs = ["quran-video-ideas", "free-quran-video-maker", "compare-quran-video-tools",
    "mistakes-quran-shorts", "schedule-quran-reels", "ramadan-content-plan",
    "friday-content", "first-quran-video-tutorial"];
  const bad = [];
  let faqTotal = 0;
  for (const s of slugs) {
    const url = `${BASE}/blog/${s}/`;
    const r = await fetch(url);
    if (r.status !== 200) { bad.push(s + "=" + r.status); continue; }
    const html = await r.text();
    const need = ['"@type":"Article"', 'datePublished":"2026-10-27"', '"FAQPage"', '"BreadcrumbList"', `rel="canonical" href="${ORIGIN}/blog/${s}/"`];
    const missing = need.filter(n => !html.includes(n));
    if (missing.length) bad.push(s + " missing:" + missing.join(","));
    faqTotal += (html.match(/"@type":"Question"/g) || []).length;
    // لا محارف CJK عرضيًّا
    const cjk = html.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/);
    if (cjk) bad.push(s + " CJK:" + cjk[0]);
  }
  chk("8 articles: LD+date+FAQ+canonical, no CJK", bad.length === 0, bad.slice(0, 3).join(" | "));
  chk("articles FAQ ≥ 32", faqTotal >= 32, "total=" + faqTotal);

  // 3) الروابط في الفوتر من ثلاث لغات/أنواع صفحات
  for (const p of ["/", "/ar/quran-video-maker/", "/en/", "/ar/reciters/", "/about/"]) {
    const html = await (await fetch(BASE + p)).text();
    chk("footer blog on " + p, html.includes('href="/blog/"'));
  }

  // 4) الروابط الداخلية داخل المقالات لا تؤدي لـ404 (عيّنة واسعة)
  const seeds = ["/blog/", "/blog/quran-video-ideas/", "/blog/ramadan-content-plan/", "/blog/compare-quran-video-tools/"];
  const seen = new Set();
  const targets = [];
  for (const s of seeds) {
    const html = await (await fetch(BASE + s)).text();
    for (const m of html.matchAll(/href="(\/[^"#]*)"/g)) {
      const t = m[1];
      if (t.startsWith("/blog") || t.startsWith("/ar/") || t === "/" || t.startsWith("/en/") || t.startsWith("/about") || t.startsWith("/privacy") || t.startsWith("/terms") || t.startsWith("/contact") || t.startsWith("/developers")) {
        if (!seen.has(t)) { seen.add(t); targets.push(t); }
      }
    }
  }
  let dead = [];
  for (const t of targets) {
    const r = await fetch(BASE + t);
    if (r.status !== 200) dead.push(t + "=" + r.status);
  }
  chk("internal links alive (" + targets.length + " unique)", dead.length === 0, dead.slice(0, 4).join(","));

  // 5) sitemap يحوي المدونة9 مرات بمساراتها الدقيقة
  const sm = await (await fetch(BASE + "/sitemap.xml")).text();
  const blogLocs = (sm.match(/<loc>[^<]*\/blog\//g) || []);
  chk("sitemap blog entries = 9", blogLocs.length === 9, String(blogLocs.length));
  const exact = ["/blog/"].concat(slugs.map(s => `/blog/${s}/`));
  const wrong = exact.filter(p => !sm.includes(`<loc>${ORIGIN}${p}</loc>`));
  chk("blog locs exact", wrong.length === 0, wrong.join(","));

  console.log(`\nBLOG TEST: ${ok} OK · ${fail} FAIL / ${ok + fail}`);
  if (fails.length) fails.forEach(f => console.log("  fail:", f));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL:", e.message); process.exit(2); });

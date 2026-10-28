#!/usr/bin/env node
/* ============================================================
   المراقبة الأسبوعية (كمل#14) — npm run monitor
     1) صحة موقعنا: كل مداخل sitemap (200) + robots + llms + علامة GSC + تذييل المدونة
     2) تتبّع المنافسين: diff sitemap مقابل لقطة سابقة (docs/monitor/)
     3) الفهرسة: استعلام site:<host> واسم علامة تجاري عبر Bing RSS + استعلام يدوي مقترح
     4) تقرير Markdown بتاريخ اليوم: docs/monitor/report-YYYY-MM-DD.{md,json}
   اختياري: BASE=… (افتراضيًا الإنتاج) · --no-index لتجاوز استعلامات البحث
   الرمز الخروج: 1 إذا فشل أي فحص في موقعنا.
   ============================================================ */
const fs = require("fs");
const path = require("path");
const { checkOwn, sitemapCount, probeSearch } = require("../lib/monitor");

const BASE = (process.env.BASE || "https://quran-reels-tau.vercel.app").replace(/\/+$/, "");
const OUR_HOST = new URL(BASE).host;
const NO_INDEX = process.argv.includes("--no-index");
const OUT_DIR = path.join(__dirname, "..", "docs", "monitor");
const COMPETITORS = ["quranreels.tech", "tashghil.pro", "quranvideomaker.com"];

const DAY = new Date().toISOString().slice(0, 10);
const fmt = n => (n < 10 ? "0" : "") + n;

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const fails = [];
  const notes = [];

  console.log("◉ مراقبة", BASE, "—", DAY);

  /* 1) موقعنا */
  const own = await checkOwn(BASE);
  if (!own.sitemap.ok) {
    fails.push("sitemap.xml لا يستجيب (" + (own.sitemap.status || own.sitemap.error) + ")");
  } else {
    console.log(`  sitemap: ${own.sitemap.count} مدخلًا`);
    if (own.urls) {
      own.urls.bad.forEach(b => fails.push(`رابط ${b.status || "خطأ"}: ${b.url}`));
      console.log(`  روابط: ${own.urls.total - own.urls.bad.length}/${own.urls.total} بحالة 200`);
    }
  }
  if (!own.robots.ok || !own.robots.hasSitemap) fails.push("robots.txt ناقص أو غير متاح");
  if (!own.llms.ok || !own.llms.hasBlog || !own.llms.hasEn) fails.push("llms.txt ناقص (قسم المدونة/الإنجليزية)");
  if (!own.home.ok || !own.home.verification) fails.push("علامة google-site-verification غير موجودة في الرئيسية");
  if (!own.home.ok || !own.home.blogFooter) fails.push("رابط تذييل /blog/ غير موجود في الرئيسية");

  /* 2) المنافسون + diff */
  const comp = [];
  for (const host of COMPETITORS) {
    const snap = await sitemapCount(host);
    const file = path.join(OUT_DIR, "competitors-" + host.replace(/\./g, "_") + ".json");
    let prev = null;
    try { prev = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
    const prevLocs = new Set((prev && prev.locs) || []);
    const nowLocs = new Set(snap.locs || []);
    const added = snap.ok ? [...nowLocs].filter(u => !prevLocs.has(u)) : [];
    const removed = snap.ok ? [...prevLocs].filter(u => !nowLocs.has(u)) : [];
    comp.push({ host, snap, prevCount: prev ? prev.locs.length : null, added, removed });
    if (snap.ok) {
      fs.writeFileSync(file, JSON.stringify({ host, checkedAt: new Date().toISOString(), locs: snap.locs }, null, 1));
      console.log(`  ${host}: ${snap.count} (+${added.length}/-${removed.length})`);
    } else {
      notes.push(`${host}: تعذّر الجلب (${snap.status || snap.error})`);
      console.log(`  ${host}: تعذّر الجلب (${snap.status || snap.error})`);
    }
  }

  /* 3) الفهرسة */
  let probes = [];
  if (!NO_INDEX) {
    probes = [
      await probeSearch("site:" + OUR_HOST, OUR_HOST),
      await probeSearch("قرآن ريلز صانع فيديو", OUR_HOST),
    ];
    for (const p of probes) {
      if (p.available) console.log(`  استعلام «${p.query}»: ${p.count} نتائج${p.ours ? " — نظهر ✅" : " — لا نظهر ❌"}`);
      else notes.push(`«${p.query}»: Bing لم يرد RSS — تحقّق يدويًا (GSC)`);
    }
  }

  /* 4) التقرير */
  const statusLine = fails.length ? `**فشل: ${fails.length}** ❌` : "**سليم ✅**";
  const md = [
    `# تقرير مراقبة الموقع — ${DAY}`,
    ``,
    `الأساس: \`${BASE}\` — الحالة العامة: ${statusLine}`,
    ``,
    `## 1) صحة موقعنا`,
    ``,
    `| فحص | النتيجة |`,
    `|---|---|`,
    `| sitemap.xml | ${own.sitemap.ok ? own.sitemap.count + " مدخلًا ✅" : "❌ " + (own.sitemap.status || own.sitemap.error)} |`,
    `| روابط sitemap | ${own.urls ? (own.urls.total - own.urls.bad.length) + "/" + own.urls.total + " بحالة 200" : "—"} |`,
    `| robots.txt | ${own.robots.ok && own.robots.hasSitemap ? "✅" : "❌"} (بوتات الذكاء: ${own.robots.hasAIBots ? "مسموح ✅" : "❌"}) |`,
    `| llms.txt | ${own.llms.ok ? "✅" : "❌"} (مدونة: ${own.llms.hasBlog ? "✅" : "❌"} · إنجليزي: ${own.llms.hasEn ? "✅" : "❌"}) |`,
    `| علامة GSC | ${own.home.verification ? "✅" : "❌"} |`,
    `| تذييل /blog/ | ${own.home.blogFooter ? "✅" : "❌"} |`,
    ``,
    ...(fails.length ? ["**الأعطال:**", ...fails.map(f => "- ❌ " + f), ""] : ["كل الفحوصات ناجحة.", ""]),
    `## 2) المنافسون (تغيّرات sitemap منذ اللقطة السابقة)`,
    ``,
    `| الموقع | المداخل | التغيّر | جديد | محذوف |`,
    `|---|---|---|---|---|`,
    ...comp.map(c => c.snap.ok
      ? `| ${c.host} | ${c.snap.count} | +${c.added.length}/−${c.removed.length} | ${c.added.slice(0, 5).join("<br>") || "—"} | ${c.removed.slice(0, 5).join("<br>") || "—"} |`
      : `| ${c.host} | تعذّر | — | — | — |`),
    ``,
    `## 3) الفهرسة (Bing RSS — تقريبية؛ الحقيقة من GSC)`,
    ``,
    ...probes.map(p => p.available
      ? `- «${p.query}»: **${p.count}** نتائج · موقعنا: ${p.ours ? "ظاهرة ✅" : "غير ظاهر ❌"}`
      : `- «${p.query}»: غير متاح — تحقّق يدويًا: \`site:${OUR_HOST}\``),
    ``,
    ...(notes.length ? [`> ملاحظات: ${notes.join(" · ")}`, ""] : []),
    `## 4) استعلام يدوي أسبوعي (GSC / المتصفح)`,
    ``,
    "```",
    `site:${OUR_HOST}          ← هل زاد عدد الصفحات المفهرسة؟`,
    `قرآن ريلز صانع فيديو      ← هل نظهر في النتائج الأولى؟`,
    `أفضل صانع فيديو قرآن مجاني ← هل نُذكر في قوائم AI/المقالات؟`,
    "```",
    ``,
    `— أُنشئ تلقائيًا بواسطة \`npm run monitor\` · نسخة JSON: \`report-${DAY}.json\``,
  ].join("\n");

  fs.writeFileSync(path.join(OUT_DIR, `report-${DAY}.md`), md);
  fs.writeFileSync(path.join(OUT_DIR, `report-${DAY}.json`), JSON.stringify({ day: DAY, base: BASE, fails, notes, own: { sitemap: own.sitemap, urls: own.urls && { total: own.urls.total, bad: own.urls.bad }, robots: own.robots, llms: own.llms, home: own.home }, competitors: comp.map(c => ({ host: c.host, count: c.snap.count, added: c.added.length, removed: c.removed.length })), probes }, null, 1));

  console.log(fails.length ? `\n✗ ${fails.length} فشل — راجع docs/monitor/report-${DAY}.md` : `\n✓ كل الفحوصات ناجحة — docs/monitor/report-${DAY}.md`);
  process.exit(fails.length ? 1 : 0);
}

main().catch(e => { console.error("Monitor crashed:", e); process.exit(2); });

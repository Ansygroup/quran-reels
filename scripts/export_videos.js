/* export_videos.js — كمل#21: تصدير فيديوهات MP4 حقيقية عبر متصفح المتصفح
 * الموقع نفسه (Canvas + MediaRecorder) → deliverables/videos/ + README (بيانات يوتيوب)
 * الاستخدام:  node scripts/export_videos.js          (كل الفيديوهات)
 *            ONLY=01 node scripts/export_videos.js   (واحد)
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "tests", "node_modules", "playwright"));

const BASE = process.env.BASE || "http://localhost:8787";
/* BATCH=c/d → الدفعة المقابلة فقط · README_ONLY=1 → تحديث README لكل الوصفات */
let RECIPES_C = [];
try { RECIPES_C = require("./video_recipes_c.js"); } catch (e) {}
let RECIPES_D = [];
try { RECIPES_D = require("./video_recipes_d.js"); } catch (e) {}
const BATCH = process.env.BATCH || "";
const OUT = path.join(__dirname, "..", "deliverables", "videos");
const SITE = "https://quran-reels-tau.vercel.app";

const RECIPES = [
  {
    file: "01-al-kawthar-short.mp4", s: 108, from: 1, to: 3,
    r: "Abdurrahmaan_As-Sudais_192kbps", reciter: "عبدالرحمن السديس", style: "card",
    title: "سورة الكوثر كاملة 🌙 الشيخ السديس | فيديو قرآن قصير #Shorts",
    desc: "سورة الكوثر — الآيات 1-3 بتلاوة الشيخ عبدالرحمن السديس، فيديو عمودي جاهز للمشاركة.\n\n📖 اقرأ الدليل: " + SITE + "/articles/short-quran-verses-video/\n\n#Shorts #قرآن #الكوثر #السديس #QuranReels",
    tags: "سورة الكوثر,الكوثر,السديس,فيديو قرآن,قرآن شورتس,Quran,Shorts,quran reels",
    link: "/articles/short-quran-verses-video/"
  },
  {
    file: "02-al-asr-reflection.mp4", s: 103, from: 1, to: 3,
    r: "Alafasy_128kbps", reciter: "مشاري راشد العفاسي", style: "card",
    title: "سورة العصر — تذكير هادئ 🕊️ العفاسي #Shorts",
    desc: "سورة العصر (1-3) بتلاوة مشاري راشد العفاسي — تذكير قصير ليومك.\n\n📖 " + SITE + "/ar/ayat-bil-mawdoo/\n\n#Shorts #قرآن #العصر #العفاسي #QuranReels",
    tags: "سورة العصر,العفاسي,تلاوة,فيديو قرآن,قرآن شورتس,Quran Reels",
    link: "/ar/ayat-bil-mawdoo/"
  },
  {
    file: "03-al-ikhlas.mp4", s: 112, from: 1, to: 4,
    r: "Alafasy_128kbps", reciter: "مشاري راشد العفاسي", style: "card",
    title: "سورة الإخلاص 🤍 العفاسي — أربع آيات تُقرأ كل يوم #Shorts",
    desc: "سورة الإخلاص كاملة (112) بتلاوة العفاسي — أربع آيات تُردَّد كل يوم.\n\n📖 " + SITE + "/articles/quran-khatma-plan/\n\n#Shorts #قرآن #الإخلاص #العفاسي #QuranReels",
    tags: "سورة الإخلاص,الإخلاص,العفاسي,فيديو قرآن,أذكار,Quran",
    link: "/articles/quran-khatma-plan/"
  },
  {
    file: "04-ad-duha.mp4", s: 93, from: 1, to: 5,
    r: "Minshawy_Murattal_128kbps", reciter: "محمد صديق المنشاوي", style: "card",
    title: "سورة الضحى — طمأنينة القلب 🌅 المنشاوي #Shorts",
    desc: "سورة الضحى (1-5) بتلاوة الشيخ محمد صديق المنشاوي (مرتل).\n\n📖 " + SITE + "/articles/khushoo-quran-video/\n\n#Shorts #قرآن #الضحى #المنشاوي #QuranReels",
    tags: "سورة الضحى,الضحى,المنشاوي,مرتل,فيديو قرآن,Quran Reels",
    link: "/articles/khushoo-quran-video/"
  },
  {
    file: "05-al-falaq.mp4", s: 113, from: 1, to: 5,
    r: "Husary_128kbps", reciter: "محمود خليل الحصري", style: "card",
    title: "سورة الفلق 🌑 الحصري — استعاذة صباحية #Shorts",
    desc: "سورة الفلق (113) بتلاوة الشيخ محمود خليل الحصري — رفيق الصباح.\n\n📖 " + SITE + "/articles/adhkar-sabah-guide/\n\n#Shorts #قرآن #الفلق #الحصري #أذكار_الصباح",
    tags: "سورة الفلق,الفلق,الحصري,أذكار الصباح,فيديو قرآن,Quran",
    link: "/articles/adhkar-sabah-guide/"
  },
  {
    file: "06-an-nas-evening.mp4", s: 114, from: 1, to: 6,
    r: "Alafasy_128kbps", reciter: "مشاري راشد العفاسي", style: "card",
    title: "سورة الناس 🌙 العفاسي — ختمة المساء #Shorts",
    desc: "سورة الناس (114) كاملة بتلاوة مشاري راشد العفاسي.\n\n📖 " + SITE + "/articles/everyday-adhkar-water-food/\n\n#Shorts #قرآن #الناس #العفاسي #QuranReels",
    tags: "سورة الناس,الناس,العفاسي,أذكار المساء,فيديو قرآن,Quran Reels",
    link: "/articles/everyday-adhkar-water-food/"
  },
  {
    file: "07-al-mulk-opening.mp4", s: 67, from: 1, to: 2,
    r: "Abdul_Basit_Murattal_192kbps", reciter: "عبدالباسط عبدالصمد (مرتل)", style: "card",
    title: "سورة الملك — الآيتان الأوليان 👑 عبدالباسط #Shorts",
    desc: "مطلع سورة الملك (67:1-2) بتلاوة الشيخ عبدالباسط عبدالصمد (مرتل).\n\n📖 خطة ختمة كل ليلة: " + SITE + "/articles/quran-khatma-plan/\n\n#Shorts #قرآن #الملك #عبدالباسط #QuranReels",
    tags: "سورة الملك,الملك,عبدالباسط,مرتل,فيديو قرآن,Quran",
    link: "/articles/quran-khatma-plan/"
  },
  {
    file: "08-al-kawthar-word-highlight.mp4", s: 108, from: 1, to: 3,
    r: "MaherAlMuaiqly128kbps", reciter: "ماهر المعيقلي", style: "word",
    title: "الكوثر كلمة-بكلمة ✨ المعيقلي — تمييز متزامن #Shorts",
    desc: "سورة الكوثر بأسلوب «كلمة-بكلمة»: كل كلمة تُبرز مع التلاوة — بتلاوة الشيخ ماهر المعيقلي.\n\nجرّب الصانع: " + SITE + "/ar/quran-word-highlight-video/\n\n#Shorts #قرآن #الكوثر #تمييز_الكلمة #QuranReels",
    tags: "كلمة بكلمة,تمييز الكلمة,الكوثر,العيقلي,معيقلي,فيديو قرآن,word by word quran",
    link: "/ar/quran-word-highlight-video/"
  }
];

const DONE_FN = () => {
  const dl = document.getElementById("btnDownload");
  const res = document.getElementById("expResult");
  const pct = document.getElementById("expPct");
  return (dl && dl.offsetParent !== null) ||
    (res && res.offsetParent !== null && res.textContent.trim().length > 4) ||
    (pct && pct.textContent.includes("100"));
};

async function exportOne(browser, rec, idx) {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`  [${idx}] pageerror:`, String(e).slice(0, 120)));
  try {
    await page.goto(`${BASE}/?s=${rec.s}&from=${from0(rec)}&to=${rec.to}&r=${rec.r}`, { waitUntil: "load", timeout: 60000 });
    // انتظار تهيئة المولّد والنص
    await page.waitForFunction(() => typeof Creator !== "undefined" && Creator.ready && typeof Quran !== "undefined" && !!Quran.data, null, { timeout: 60000 });
    await page.waitForFunction((s) => {
      const sel = document.getElementById("selSurah");
      return sel && sel.options && sel.options.length > 5 && String(sel.value) === String(s);
    }, rec.s, { timeout: 30000 }).catch(() => {});
    // ضمان الاختيار (احتياط كما في run.js)
    await page.evaluate(({ s, from, to, r }) => {
      const set = (id, v) => { const e = document.getElementById(id); if (e) { e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); } };
      const sel = document.getElementById("selSurah");
      if (sel && String(sel.value) !== String(s)) {
        const opt = [...sel.options].find(o => o.value === String(s));
        if (opt) sel.value = opt.value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const sr = document.getElementById("selReciter");
      if (sr && r && sr.value !== r) { sr.value = r; sr.dispatchEvent(new Event("change", { bubbles: true })); }
      set("txtFrom", String(from)); set("txtTo", String(to));
    }, { s: rec.s, from: rec.from, to: rec.to, r: rec.r });
    if (rec.trans) {
      await page.evaluate((lang) => {
        const st = document.getElementById("selTrans");
        if (!st) return;
        const o = [...st.options].find(o => o.value === lang || (o.value && o.value.includes(lang)) || /english/i.test(o.textContent) || /إنجليزي/i.test(o.textContent));
        if (o) { st.value = o.value; st.dispatchEvent(new Event("change", { bubbles: true })); }
      }, rec.trans);
      await page.waitForTimeout(1200);
    }
    await page.waitForFunction(({ to }) => String(document.getElementById("txtTo")?.value) === String(to), { to: rec.to }, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1200);
    if (rec.style === "word") {
      await page.evaluate(() => document.querySelector('#segStyle button[data-style="word"]')?.click());
      await page.waitForTimeout(500);
    }
    // معاينة قصيرة (تدفئة الصوت كما في run.js) ثم إنشاء
    await page.evaluate(() => document.getElementById("create")?.scrollIntoView());
    await page.click("#btnPlay").catch(() => {});
    await page.waitForTimeout(2200);
    await page.click("#btnPlay").catch(() => {});
    await page.waitForTimeout(300);
    const t0 = Date.now();
    await page.click("#btnCreate", { timeout: 60000 });
    await page.waitForTimeout(900);
    await page.click(".overlay [data-ok]").catch(() => {});
    await page.waitForFunction(DONE_FN, null, { timeout: 150000 });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const info = await page.evaluate(() => ({
      res: (document.getElementById("expResult")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 180),
      pct: document.getElementById("expPct")?.textContent || ""
    }));
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60000 }),
      page.click("#btnDownload")
    ]);
    const dest = path.join(OUT, rec.file);
    await download.saveAs(dest);
    const size = fs.statSync(dest).size;
    return { ok: size > 10000, size, secs: Number(secs), info };
  } catch (e) {
    return { ok: false, err: String(e).slice(0, 220) };
  } finally {
    await ctx.close().catch(() => {});
  }
}
function from0(rec) { return rec.from || 1; }

function fmtSize(n) {
  if (n >= 1048576) return (n / 1048576).toFixed(1) + " MB";
  return Math.round(n / 1024) + " KB";
}

function writeReadme(results, list) {
  list = list || RECIPES;
  const withSize = (r, i) => {
    if (results && results[i] && results[i].ok) return { ok: true, size: results[i].size, secs: results[i].secs, info: results[i].info, err: results[i].err };
    const f = path.join(OUT, r.file);
    if (fs.existsSync(f)) { const st = fs.statSync(f); if (st.size > 10000) return { ok: true, size: st.size, secs: null, info: null }; }
    return { ok: false, err: (results && results[i] && results[i].err) || "غير موجود" };
  };
  const rows = list.map((r, i) => {
    const x = withSize(r, i);
    return `| ${i + 1} | \`${r.file}\` | ${r.s}:${r.from}-${r.to} | ${r.reciter} | ${r.style === "word" ? "كلمة-بكلمة" : (r.trans ? "ترجمة" : "بطاقة")} | ${x.ok ? fmtSize(x.size) : "❌"} |`;
  }).join("\n");
  const details = list.map((r, i) => {
    const x = withSize(r, i);
    return [
      `### ${i + 1}. \`${r.file}\``,
      `- **الحالة**: ${x.ok ? "✅ " + fmtSize(x.size) : "❌ " + (x.err || "failed")}${x.secs ? " · زمن التصدير " + x.secs + " ث (زمن آني ≈ زمن المقطع)" : ""}`,
      x.info && x.info.res ? `- **قراءة المولّد**: ${x.info.res}` : null,
      `- **المحتوى**: سورة رقم ${r.s} الآيات ${r.from}-${r.to} · القارئ: ${r.reciter} · الأسلوب: ${r.style === "word" ? "تمييز كلمة-بكلمة" : "بطاقة"}`,
      `- **عنوان يوتيوب المقترح**: ${r.title}`,
      `- **الوصف المقترح**:`,
      "```",
      r.desc,
      "```",
      `- **الوسوم**: ${r.tags}`,
      `- **رابط في الوصف**: ${SITE}${r.link}`,
      ""
    ].filter(Boolean).join("\n");
  }).join("\n");

  const md = `# فيديوهات قرآن ريلز — إنتاج كمل#21 (MP4 حقيقي)

> صُنِعت فعليًا عبر الموقع نفسه (Playwright يقود المتصفح ← Canvas + MediaRecorder ← تنزيل مباشر).
> المقاس **1080×1920 (9:16)** · بلا علامة مائية · جاهزة لـ YouTube Shorts.
> الحارس: \`scripts/export_videos.js\` · إعادة الإنتاج: \`node scripts/export_videos.js\` (BASE محلي/إنتاج).

## الملفات

| # | الملف | الآيات | القارئ | الأسلوب | الحجم |
|---|-------|--------|--------|---------|-------|
${rows}

## بيانات النشر — يوتيوب (أولوية أولى)

كل مقطع يُرفع **عموديًا (Shorts)**، الوصف يحوي رابط الموقع المرتبط بالمقال، وذِكر القارئ إلزامي.
الوسوم المقترحة للقناة عمومًا: \`quran, quran reels, سورة, تلاوة, فيديو قرآن, short quran video\`.
\`#Shorts\` موجود داخل العنوان والوصف لكل مقطع.

${details}

## قواعد الرفع (YouTube Shorts)

1. رفع الملف كما هو (عمودي) — لا حاجة لقص.
2. العنوان من المقترحات أعلاه + \`#Shorts\`.
3. الوصف: الجملة الأولى تصف المقطع، ثم الرابط، ثم الوسوم.
4. التعليق المثبّت: «آية اليوم من [السورة] — اكتب رأيك 👇».
5. البطاقة النهائية (اختياري): أضف رابط اشتراك بعد نشر الفيديو من استوديو يوتيوب.

## أرشيف لاحق

- لجولة قادمة: سور إضافية + أقوال نبوية + تهنئة موسمية (رمضان/الأعياد) من نفس الحارس.
- الترجمة (8 لغات) تُفعَّل من إعدادات المولّد قبل الإنشاء لكل جمهور.
`;
  fs.writeFileSync(path.join(OUT, "README.md"), md, "utf8");
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.env.ONLY;
  let list = BATCH === "c" ? RECIPES_C : BATCH === "d" ? RECIPES_D : RECIPES;
  if (only) list = list.filter(r => r.file.startsWith(only));
  if (process.env.README_ONLY === "1") {
    writeReadme(null, RECIPES.concat(RECIPES_C, RECIPES_D));
    console.log("README refreshed for", RECIPES.concat(RECIPES_C, RECIPES_D).length, "recipes");
    return;
  }
  console.log(`export_videos: ${list.length} recipe(s) → ${OUT}`);
  const browser = await chromium.launch({
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox"]
  });
  const results = [];
  let allIdx = 0;
  for (const rec of list) {
    allIdx++;
    console.log(`[${allIdx}/${list.length}] ${rec.file} (s${rec.s}:${rec.from}-${rec.to} ${rec.r}${rec.style === "word" ? " word" : ""})`);
    const t0 = Date.now();
    const r = await exportOne(browser, rec, allIdx);
    console.log(`   → ${r.ok ? "OK " + fmtSize(r.size) : "FAIL " + (r.err || "")} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    results.push(r);
  }
  await browser.close();
  writeReadme(results, list);
  const okN = results.filter(r => r.ok).length;
  console.log(`DONE: ${okN}/${results.length} MP4 exported`);
  if (okN !== results.length) process.exitCode = 1;
})();

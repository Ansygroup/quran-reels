/* Server-side daily Quran reel generation and publishing (multi-channel & parallel). */
const crypto = require("node:crypto");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const fs = require("node:fs/promises");
/* Chromium وplaywright لا يُحمّلان في نطاق الوحدة (require أعلى الملف).
 * @sparticuz/chromium حزمة ESM خالصة (`"type": "module"`، 67MB) وكان require لها
 * في أعلى الملف يُسقط كل دالة تستورد هذه الوحدة عند الإقلاع في الإنتاج:
 * /api/autopilot و/api/cron/publish كانتا تعيدان 500 FUNCTION_INVOCATION_FAILED
 * على كل طلب (لوحة الحساب معطّلة والكرون اليومي يفشل بصمت)، بينما بقية الدوال تعمل.
 * الآن يُحمّلان عند الحاجة فقط، داخل renderRecipe، برسالة واضحة إن تعذّر التحميل.
 */
let renderDepsCache = null;
async function renderDeps() {
  if (renderDepsCache) return renderDepsCache;
  /* على Vercel (Amazon Linux 2023) يحتاج chromium مكتبات نظام لا توجد في الصورة
   * (libnss3.so …). الحزمة تُضمّنها في bin/al2023.tar.br وتفكّها فقط إن اعتبرت
   * البيئة «Lambda AL2023». كشفها يعتمد على متغيّرات AWS، ونضبطها صراحةً هنا
   * قبل الاستيراد كي تُفكّ المكتبات ويُضبط LD_LIBRARY_PATH — وإلا فشل التشغيل بـ
   * «libnss3.so: cannot open shared object file» (خطأ إنتاج فعلي 2026-11-04). */
  if (process.env.VERCEL && !process.env.AWS_LAMBDA_JS_RUNTIME) {
    process.env.AWS_LAMBDA_JS_RUNTIME = `nodejs${process.versions.node.split(".")[0]}.x`;
  }
  try {
    const { default: chromiumBin } = await import("@sparticuz/chromium");
    const { chromium: playwright } = await import("playwright-core");
    /* حزام أمان: إن فُكّت مكتبات al2023 فلتكن على مسار البحث قبل إطلاق المتصفح */
    try {
      const libDir = join(tmpdir(), "al2023", "lib");
      const fsmod = require("node:fs");
      if (fsmod.existsSync(libDir)) {
        const parts = String(process.env.LD_LIBRARY_PATH || "").split(":").filter(Boolean);
        if (!parts.includes(libDir)) process.env.LD_LIBRARY_PATH = [libDir, ...parts].join(":");
      }
    } catch { /* تجاهل */ }
    renderDepsCache = { chromiumBin, playwright };
    return renderDepsCache;
  } catch (error) {
    const err = new Error(`تعذّر تحميل محرّك المتصفح (chromium/playwright): ${String(error?.message || error).slice(0, 200)}`);
    err.code = "RENDER_DEPS_UNAVAILABLE";
    throw err;
  }
}
const { q, q1, rest } = require("./db");
const { publishRow } = require("./publish");

const SITE = () => (process.env.SITE_ORIGIN || "https://quran-reels-tau.vercel.app").replace(/\/$/, "");

// قائمة المنصات من مصدر واحد (lib/platforms.js) — لا تكرار
const { NAMES: PLATFORM_NAMES, canPublish } = require("./platforms");
const PLATFORMS = PLATFORM_NAMES;

const START_RECIPES = [
  { file: "01-al-kawthar-short.mp4", s: 108, from: 1, to: 3, r: "Abdurrahmaan_As-Sudais_192kbps", reciter: "عبدالرحمن السديس", style: "card", title: "سورة الكوثر كاملة 🌙 الشيخ السديس | فيديو قرآن قصير #Shorts", desc: "سورة الكوثر — الآيات 1-3 بتلاوة الشيخ عبدالرحمن السديس، فيديو عمودي جاهز للمشاركة.\n\n📖 اقرأ الدليل: https://quran-reels-tau.vercel.app/articles/short-quran-verses-video/", tags: "سورة الكوثر,الكوثر,السديس,فيديو قرآن,قرآن شورتس,Quran,Shorts,quran reels" },
  // ... (بقية START_RECIPES كما هي في lib/autopilot.js الأصلي) ...
  { file: "08-al-kawthar-word-highlight.mp4", s: 108, from: 1, to: 3, r: "MaherAlMuaiqly128kbps", reciter: "ماهر المعيقلي", style: "word", title: "الكوثر كلمة-بكلمة ✨ المعيقلي — تمييز متزامن #Shorts", desc: "سورة الكوثر بأسلوب كلمة-بكلمة: كل كلمة تُبرز مع التلاوة — بتلاوة الشيخ ماهر المعيقلي.\n\nجرّب الصانع: https://quran-reels-tau.vercel.app/ar/quran-word-highlight-video/", tags: "كلمة بكلمة,تمييز الكلمة,الكوثر,المعيقلي,فيديو قرآن,word by word quran" },
];
const RECIPES = START_RECIPES.concat(
  require("../scripts/video_recipes_c"),
  require("../scripts/video_recipes_d")
).map(r => ({ ...r, title: String(r.title || "").normalize("NFC"), desc: String(r.desc || "").normalize("NFC") }));
const FAMOUS_SURAHS = new Set([1, 2, 36, 55, 67, 93, 97, 103, 108, 112, 113, 114]);
const RECITERS = [...new Map(RECIPES.map(r => [r.r, { id: r.r, name: r.reciter }])).values()];
const CONTENT_MODES = new Set(["mix", "famous", "sequential", "article"]); // دعم المقالات
const BACKGROUND_IDS = new Set(["rotate", "bg-mosque-night", "bg-starry-desert", "bg-ocean-sunset", "bg-forest-rays", "bg-geometric-islamic", "bg-mountains-dawn", "bg-mosque-silhouette", "bg-garden-tulips", "bg-arabesque-dark", "bg-heavenly-clouds", "grad-emerald", "grad-gold", "grad-dawn", "grad-night"]);

function cairoDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function parseTemplate(value) {
  if (value && typeof value === "string") { try { value = JSON.parse(value); } catch { value = {}; } }
  const t = value && typeof value === "object" ? value : {};
  return {
    content_mode: CONTENT_MODES.has(t.content_mode) ? t.content_mode : "mix",
    reciter_mode: "rotate",
    reciter: "",
    background: BACKGROUND_IDS.has(t.background) ? t.background : "rotate",
    privacy: "public",
  };
}

function chooseRecipe(template, index) {
  let list = RECIPES;
  if (template.content_mode === "famous") list = RECIPES.filter(r => FAMOUS_SURAHS.has(Number(r.s)));
  if (template.content_mode === "sequential") list = [...RECIPES].sort((a, b) => Number(a.s) - Number(b.s) || Number(a.from) - Number(b.from) || a.file.localeCompare(b.file));
  
  // دعم توليد البوست من المقالات (العدد من مكتبة posts/index*.js)
  if (template.content_mode === "article" && index !== undefined && index.article) {
    return {
      s: 1, from: 1, to: 1, r: RECITERS[0].id, reciter: RECITERS[0].name,
      style: "card",
      title: `مقال قرآني رقم ${index.article.id} — ${index.article.title} | قرآن ريلز`,
      desc: `مقال قرآني رقم ${index.article.id} — آيات مختارة.\n\n📖 اقرأ المقال: https://quran-reels-tau.vercel.app/articles/${index.article.id}\n\n#قرآن #مقال #إسلاميات #تلاوة #ريلز`,
      tags: "قرآن,مقال,إسلاميات,تلاوة,ريلز",
      article_id: index.article.id,
      article_title: index.article.title
    };
  }

  if (!list.length) list = RECIPES;
  return list[((index % list.length) + list.length) % list.length];
}

function reciterFor(recipe, template, index) {
  if (template.reciter_mode === "fixed" && RECITERS.some(r => r.id === template.reciter)) {
    return RECITERS.find(r => r.id === template.reciter);
  }
  // The curated recipe library itself rotates through the supported reciters.
  return { id: recipe.r, name: recipe.reciter };
}

/* أعلام تمنع Chromium من تقييد المؤقّتات/الرسم في وضع headless.
 * التسجيل في المتصفح يعتمد requestAnimationFrame وWeb Audio بالزمن الحقيقي؛
 * حين تُعدّ الصفحة «خلفية» أو «مغطاة» يتوقف rAF فيبدو التسجيل معلّقًا حتى
 * انتهاء المهلة (هذا ما ظهر في تشغيلات 8–11 نوفمبر: waitForFunction 210s). */
const LAUNCH_FLAGS = [
  "--autoplay-policy=no-user-gesture-required",
  "--no-sandbox",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-features=CalculateNativeWinOcclusion",
];

/* انتظار اكتمال التصدير مع تشخيص حقيقي بدل مهلة صامتة.
 * يقرأ حالة الصفحة كل ٣ ثوانٍ: النسبة والمرحلة والنتيجة. عند الفشل يرمي
 * رسالة تحمل آخر حالة (0% عند «تحضير التلاوة» ≠ 40% عند «تسجيل الفيديو»). */
async function waitForExport(page, timeoutMs = 210000, stallLimitMs = 90000) {
  const started = Date.now();
  let last = { pct: "", stage: "", running: false, result: false };
  let lastChange = Date.now();
  let prev = "";
  while (Date.now() - started < timeoutMs) {
    last = await page.evaluate(() => {
      const txt = (id) => (document.getElementById(id)?.textContent || "").trim();
      const shown = (id) => { const el = document.getElementById(id); return Boolean(el && el.offsetParent !== null); };
      return {
        pct: txt("expPct"),
        stage: txt("expStage"),
        running: shown("expRunning"),
        result: (shown("expResult") && txt("expResult").length > 4) || shown("btnDownload"),
        meta: txt("resultMeta"),
      };
    }).catch(() => last);
    if (last.result) return last;
    const sig = `${last.pct}|${last.stage}`;
    if (sig !== prev) { prev = sig; lastChange = Date.now(); }
    if (Date.now() - lastChange > stallLimitMs) {
      throw new Error(`توليد الفيديو توقّف عند «${last.stage || "غير معروف"}» (${last.pct || "0%"}) بلا تقدّم ${Math.round(stallLimitMs / 1000)}s — آخر حالة: ${JSON.stringify(last)}`.slice(0, 400));
    }
    await page.waitForTimeout(3000);
  }
  throw new Error(`توليد الفيديو لم يكتمل خلال ${Math.round(timeoutMs / 1000)}s — آخر حالة: ${JSON.stringify(last)}`.slice(0, 400));
}

async function renderRecipe(recipe, reciter, background, runIndex) {
  const { chromiumBin, playwright } = await renderDeps();
  const browser = await playwright.launch({
    executablePath: await chromiumBin.executablePath(),
    args: [...chromiumBin.args, ...LAUNCH_FLAGS],
    headless: true,
  });
  let context;
  try {
    context = await browser.newContext({ acceptDownloads: true, viewport: { width: 900, height: 1200 } });
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    await page.goto(`${SITE()}/?s=${encodeURIComponent(recipe.s)}&from=${encodeURIComponent(recipe.from)}&to=${encodeURIComponent(recipe.to)}&r=${encodeURIComponent(reciter.id)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => typeof Creator !== "undefined" && Creator.ready && typeof Quran !== "undefined" && !!Quran.data, null, { timeout: 60000 });
    const translation = recipe.trans === "en" ? "en.sahih" : (recipe.trans || "none");
    await page.evaluate(async ({ s, from, to, r, bg, style, trans, runIndex }) => {
      const set = (id, value) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = String(value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const surah = document.getElementById("selSurah");
      if (surah) { surah.value = String(s); surah.dispatchEvent(new Event("change", { bubbles: true })); }
      set("selReciter", r);
      set("selTrans", trans || "none");
      set("txtFrom", from);
      set("txtTo", to);
      if (trans && trans !== "none") {
        await Quran.loadTranslation(trans);
        Selection.translation = trans;
        Selection.showTrans = true;
        Creator._updateTransForRenderer();
      } else {
        Selection.translation = "none";
        Selection.showTrans = false;
      }
      if (bg && bg !== "rotate" && typeof Selection !== "undefined") {
        Selection.bg = bg;
        await Creator._applyBackground();
      } else if (bg === "rotate" && typeof BACKGROUNDS !== "undefined" && typeof Selection !== "undefined") {
        const choices = BACKGROUNDS.filter(x => x.file || x.grad);
        const pick = choices[(runIndex % choices.length + choices.length) % choices.length];
        if (pick) { Selection.bg = pick.id; await Creator._applyBackground(); }
      }
      if (typeof Selection !== "undefined") {
        Selection.ratio = "9:16";
        Selection.style = style === "word" ? "word" : "card";
        Selection.showWatermark = true;
        Selection.save();
      }
      if (style === "word") document.querySelector('#segStyle button[data-style="word"]')?.click();
    }, { s: recipe.s, from: recipe.from, to: recipe.to, r: reciter.id, bg: background, style: recipe.style || "card", trans: translation, runIndex });

    // Warm the Web Audio context, then stop the preview before the full capture.
    await page.bringToFront().catch(() => {});
    await page.click("#btnPlay").catch(() => {});
    await page.waitForTimeout(1400);
    await page.click("#btnPlay").catch(() => {});
    await page.waitForTimeout(250);
    await page.locator("#btnCreate").scrollIntoViewIfNeeded();
    await page.click("#btnCreate", { timeout: 45000 });
    await page.waitForTimeout(900);
    await page.locator(".overlay [data-ok]").click({ timeout: 2500 }).catch(() => {});
    await waitForExport(page, 210000, 90000);
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60000 }),
      page.click("#btnDownload"),
    ]);
    const filePath = await download.path();
    if (!filePath) throw new Error("تعذّر استلام ملف الفيديو من المولّد");
    const buffer = await fs.readFile(filePath);
    if (buffer.length < 20000) throw new Error("ملف الفيديو الناتج أصغر من المتوقع");
    const filename = download.suggestedFilename() || "quran-reel.webm";
    const webm = /\.webm$/i.test(filename) || (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3);
    return { buffer, filename: `quran-${recipe.s}-${recipe.from}-${recipe.to}-${Date.now()}.${webm ? "webm" : "mp4"}`, mime: webm ? "video/webm" : "video/mp4" };
  } finally {
    if (context) await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

/* أعمدة المقالات (article_id/article_title) قد لا تكون مضافة في القاعدة بعد؛
 * لا نُسقط التشغيل بسببها — نُعيد المحاولة بدونها ونترك بقية البيانات كما هي. */
const ARTICLE_COLS = ["article_id", "article_title"];
const hasArticleCols = (obj) => ARTICLE_COLS.some((k) => k in (obj || {}));
const stripArticleCols = (obj) => {
  const out = { ...obj };
  for (const k of ARTICLE_COLS) delete out[k];
  return out;
};

async function patchRun(id, values) {
  const url = `/rest/v1/autopilot_runs?id=eq.${encodeURIComponent(id)}`;
  const body = { ...values, updated_at: new Date().toISOString() };
  try {
    return await rest(url, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(body) });
  } catch (e) {
    if (!hasArticleCols(body) || !/column|does not exist/i.test(String(e && e.message))) throw e;
    return rest(url, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(stripArticleCols(body)) });
  }
}

async function getRunIndex(userId, runDate, runType, config) {
  if (runType === "daily") {
    const first = await rest(`/rest/v1/autopilot_runs?user_id=eq.${encodeURIComponent(userId)}&select=run_date&order=run_date.asc&limit=1`);
    if (Array.isArray(first) && first[0]?.run_date) {
      const days = (Date.parse(`${runDate}T00:00:00Z`) - Date.parse(`${first[0].run_date}T00:00:00Z`)) / 86400000;
      return Math.max(0, Math.floor(days));
    }
    return 0;
  }
  const rows = await rest(`/rest/v1/autopilot_runs?user_id=eq.${encodeURIComponent(userId)}&select=id&order=created_at.desc&limit=1000`);
  
  // دعم توليد البوست من المقالات
  let index = Array.isArray(rows) ? rows.length - 1 : 0;
  if (config?.template?.content_mode === "article") {
    const article = config?.article || {};
    return { index, article };
  }
  return index;
}

async function updateAutopilotHeartbeat(userId) {
  try { await q(`update autopilot set updated_at=now() where user_id=$1`, [userId]); } catch {}
}

async function createRun(userId, runType, runDate, article = null) {
  const runKey = runType === "daily" ? `daily:${userId}:${runDate}` : `manual:${userId}:${crypto.randomUUID()}`;
  const prior = await q1(`select * from autopilot_runs where run_key=$1 limit 1`, [runKey]);
  if (prior) return { existing: true, run: prior };
  
  const values = { user_id: userId, run_key: runKey, run_type: runType, run_date: runDate, status: "rendering", started_at: new Date().toISOString() };
  if (article) {
    values.article_id = article.id;
    values.article_title = article.title;
  }
  
  let inserted;
  try {
    inserted = await rest("/rest/v1/autopilot_runs", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(values),
    });
  } catch (e) {
    if (!hasArticleCols(values) || !/column|does not exist/i.test(String(e && e.message))) throw e;
    inserted = await rest("/rest/v1/autopilot_runs", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(stripArticleCols(values)),
    });
  }
  return { existing: false, run: Array.isArray(inserted) ? inserted[0] : inserted };
}

async function getConfig(userId) {
  return q1(`select * from autopilot where user_id=$1 limit 1`, [userId]);
}

async function hasPlatformConnection(userId, platforms) {
  /* عطل إنتاجي: PostgREST لا يعطي الاقتباس المفرد معنى داخل in.(…) فيعامل
   * 'youtube' كنص حرفي ولا يطابق أي صف — فكان هذا الحاجز يعيد false دائمًا
   * ويُفشل كل تشغيل بـ«اربط القنوات أولًا» رغم أن القناة مربوطة (تشغيل
   * 2026-11-07 10:39:55 دليل حيّ). نقارن في JavaScript اعتمادًا على
   * connectedPlatforms الموجود أصلًا. */
  try {
    const set = await connectedPlatforms(userId);
    return (Array.isArray(platforms) ? platforms : []).some(p => set.has(p));
  } catch { return false; }
}

/* المنصات المرتبطة فعلًا لهذا المستخدم (مفتاح المنصة فقط) */
async function connectedPlatforms(userId) {
  try {
    const rows = await rest(`/rest/v1/social_connections?user_id=eq.${encodeURIComponent(userId)}&select=platform`);
    return new Set(Array.isArray(rows) ? rows.map(r => r.platform) : []);
  } catch { return new Set(); }
}

function metadata(recipe, reciter, platform) {
  // دعم تعدد القنوات (تخصيص البوست لكل منصة)
  const base = recipe.article_title || `سورة ${recipe.s} — الآيات ${recipe.from}-${recipe.to} #Shorts`;
  const note = recipe.article_id ? "اقرأ المقال الكامل وشارك الفائدة 🤍" : "مقطع قرآني من السورة، الآيات، بتلاوة. https://quran-reels-tau.vercel.app/ar/quran-video-maker/";
  const tags = recipe.article_id ? ["قرآن", "مقال", "إسلاميات", "تلاوة", "ريلز"] : (recipe.tags || "قرآن,تلاوة,Shorts").split(",");
  const hashtags = tags.map(t => "#" + t.trim()).join(" ");
  
  let title = base;
  let caption = `${base}\n\n${note}\n\n${hashtags}`;
  
  // تخصيص حسب المنصة
  const titleMap = {
    youtube: base.slice(0, 100),
    facebook: base.slice(0, 80),
    instagram: base.slice(0, 120),
    tiktok: `${base} 🤍`.slice(0, 150),
    x: `${base} 🤍`.slice(0, 240),
    linkedin: base.slice(0, 300),
    telegram: base.slice(0, 200),
    whatsapp: base.slice(0, 200),
  };
  
  return { title: titleMap[platform] || base, caption, hashtags, note };
}

// دعم التوازي وتعدد القنوات
async function generateAndPublish(userId, { runType = "manual", config = null, article = null } = {}) {
  const row = config || await getConfig(userId);
  const template = parseTemplate(row?.template);
  const runDate = cairoDate();
  
  // دمج المقال إذا وُجد
  const runConfig = article ? { ...row, template: { ...template, content_mode: "article" }, article } : row;
  
  const { existing, run } = await createRun(userId, runType, runDate, article);
  if (existing) return { ok: run.status === "published", duplicate: true, run_id: run.id, status: run.status, url: run.external_url || null };

  const requested = (runConfig?.platforms || ["youtube"]).filter(canPublish);
  if (requested.length === 0) throw new Error("لا توجد منصات قابلة للنشر في الإعداد");
  /* لا نُنشئ مهمة لمنصة بلا ربط: كانت تُنشأ ثم تفشل عند النشر
   * بـ«لا يوجد ربط لهذه المنصة» وتترك صفوفًا فاشلة في publish_queue. */
  const connectedSet = await connectedPlatforms(userId);
  const platforms = requested.filter(p => connectedSet.has(p));
  if (platforms.length === 0) {
    throw new Error(`المنصات المختارة غير مرتبطة (${requested.join(", ")}) — اربط قناة واحدة منها أولًا`);
  }

  let queueRows = [];
  try {
    if (!await hasPlatformConnection(userId, platforms)) throw new Error("اربط القنوات أولًا قبل تشغيل الإنشاء والنشر الآلي");
    
    const runIndex = await getRunIndex(userId, runDate, runType, runConfig);
    const recipe = chooseRecipe(template, runIndex);
    const reciter = reciterFor(recipe, template, runIndex);
    
    await patchRun(run.id, { recipe_key: `${recipe.s}:${recipe.from}-${recipe.to}`, reciter: reciter.name, title: recipe.article_title || `سورة ${recipe.s}`, article_id: recipe.article_id, article_title: recipe.article_title });
    
    const rendered = await renderRecipe(recipe, reciter, template.background, runIndex);
    const storagePath = `${userId}/autopilot/${runDate}-${run.id}.${rendered.mime === "video/webm" ? "webm" : "mp4"}`;
    const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
    await rest(`/storage/v1/object/reels/${encodedPath}`, {
      method: "POST",
      headers: { "Content-Type": rendered.mime, "x-upsert": "true" },
      body: rendered.buffer,
    });

    // دعم التوازي: إنشاء صفوف النشر لكل منصة
    const insertPromises = platforms.map(async (platform) => {
      const meta = metadata(recipe, reciter, platform);
      const inserted = await rest("/rest/v1/publish_queue", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          user_id: userId, platform, video_path: storagePath, video_name: rendered.filename,
          title: meta.title, caption: meta.caption, hashtags: meta.hashtags,
          status: "scheduled", publish_at: new Date().toISOString(),
        }),
      });
      return { platform, row: Array.isArray(inserted) ? inserted[0] : inserted };
    });

    const insertedRows = await Promise.all(insertPromises);
    queueRows = insertedRows.map(i => i.row);

    // نشر متوازي
    const publishPromises = insertedRows.map(async (i) => {
      const out = await publishRow(i.row);
      if (!out.ok) throw new Error(`${i.platform}: ${out.error || "فشل النشر"}`);
      return { platform: i.platform, url: out.url };
    });

    const publishResults = await Promise.allSettled(publishPromises);
    const failed = publishResults.filter(r => r.status === "rejected");
    
    if (failed.length > 0) {
      await patchRun(run.id, { status: "failed", error: `فشل في ${failed.length} منصات: ${failed.map(f => f.reason.message).join("; ")}`, completed_at: new Date().toISOString() });
      return { ok: false, run_id: run.id, error: `فشل النشر في بعض المنصات (${failed.length})` };
    }

    const successUrls = publishResults.map(r => r.status === "fulfilled" ? r.value.url : null).filter(Boolean);
    await patchRun(run.id, { status: "published", external_url: successUrls.join(" | "), completed_at: new Date().toISOString(), error: null });
    
    return { ok: true, run_id: run.id, url: successUrls.join(" | "), title: recipe.article_title || `سورة ${recipe.s}`, recipe: `${recipe.s}:${recipe.from}-${recipe.to}`, platforms };
  } catch (error) {
    await patchRun(run.id, { status: "failed", error: String(error?.message || error).slice(0, 500), completed_at: new Date().toISOString() }).catch(() => {});
    return { ok: false, run_id: run.id, error: String(error?.message || error).slice(0, 500) };
  } finally {
    if (runType === "daily") await updateAutopilotHeartbeat(userId);
  }
}

async function runDailyAutopilots() {
  const configs = await q(`select * from autopilot where enabled='true' order by updated_at asc limit 3`);
  const list = Array.isArray(configs) ? configs.filter(a => Array.isArray(a.platforms) && a.platforms.length > 0) : [];
  const results = [];
  for (const config of list) {
    try {
      const result = await generateAndPublish(config.user_id, { runType: "daily", config });
      results.push({ user_id: config.user_id, ...result });
    } catch (error) {
      results.push({ user_id: config.user_id, ok: false, error: String(error?.message || error).slice(0, 300) });
    }
  }
  return results;
}

/* فحص تشغيل المتصفح — يُستدعى من لوحة الحساب (action: selftest_render).
 * الغرض: تحويل «هل يعمل التوليد على Vercel؟» من تخمين إلى إجابة بأزرار واحدة،
 * مع تقرير كامل (مسار التنفيذ، وجود Creator، زمن التشغيل، نص الخطأ الحقيقي).
 * لا يُنشئ فيديو ولا ينشر شيئًا. */
async function renderSelfTest() {
  const started = Date.now();
  const report = {
    node: process.versions.node,
    vercel: Boolean(process.env.VERCEL),
    ld_library_path: process.env.LD_LIBRARY_PATH || null,
  };
  let browser = null;
  try {
    const { chromiumBin, playwright } = await renderDeps();
    report.executable_path = await chromiumBin.executablePath();
    browser = await playwright.launch({
      executablePath: report.executable_path,
      args: [...chromiumBin.args, "--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
      headless: true,
    });
    const page = await browser.newPage();
    await page.goto(`${SITE()}/?selftest=1`, { waitUntil: "domcontentloaded", timeout: 30000 });
    report.page_title = await page.title();
    report.creator_ready = await page.evaluate(() => typeof Creator !== "undefined" && Boolean(Creator.ready)).catch(() => false);
    report.ok = true;
  } catch (error) {
    report.ok = false;
    report.error = String(error?.message || error).slice(0, 400);
  } finally {
    try { if (browser) await browser.close(); } catch { /* تجاهل */ }
  }
  report.ms = Date.now() - started;
  return report;
}

module.exports = { RECIPES, RECITERS, CONTENT_MODES, BACKGROUND_IDS, parseTemplate, chooseRecipe, generateAndPublish, runDailyAutopilots, cairoDate, renderSelfTest };
/* للاختبارات فقط — Vercel لا يستخدم هذه الخصائص */
module.exports.__test = { renderDeps, renderSelfTest, connectedPlatforms, hasPlatformConnection, waitForExport, LAUNCH_FLAGS };

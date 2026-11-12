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

/* يوم بتوقيت القاهرة بإزاحة أيام (‎-1‎ = أمس) */
function dayShift(dateStr, delta) {
  const t = new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + delta);
  return t.toISOString().slice(0, 10);
}

/* الأيام الماضية التي لم يُنشر فيها شيء. يوم ضاع لا يعود من نفسه:
 * التشغيل اليومي ينتج فيديو «اليوم» فقط، فإذا فشل يومًا بقي ناقصًا للأبد.
 * هنا نحدد أقرب يوم ناقص (أمس أولًا) كي يُعوّضه كرون الإنقاذ بلا تدخل. */
function missingDays(runs, today, lookback = 2) {
  const list = Array.isArray(runs) ? runs : [];
  const published = new Set(list.filter((r) => r && r.status === "published").map((r) => String(r.run_date).slice(0, 10)));
  const attempted = new Set(list
    .filter((r) => r && /:backfill$/.test(String(r.run_key || "")))
    .map((r) => String(r.run_date).slice(0, 10)));
  const out = [];
  for (let i = 1; i <= Math.max(0, Number(lookback) || 0); i++) {
    const day = dayShift(today, -i);
    if (published.has(day) || attempted.has(day)) continue;
    out.push(day);
  }
  return out;
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
      const toastEl = document.querySelector(".toast");
      return {
        pct: txt("expPct"),
        stage: txt("expStage"),
        running: shown("expRunning"),
        result: (shown("expResult") && txt("expResult").length > 4) || shown("btnDownload"),
        meta: txt("resultMeta"),
        /* تشخيص ما قبل التسجيل: هل بدأ التصدير أصلًا؟ هل ينتظر حوارًا؟ */
        exporting: Boolean(typeof Creator !== "undefined" && Creator.exporting),
        dialog: Boolean(document.querySelector(".overlay [data-ok]")),
        toast: (toastEl && toastEl.textContent ? toastEl.textContent : "").trim().slice(0, 80),
        count: (typeof Selection !== "undefined" && Selection.count) ? Number(Selection.count()) : null,
        abort: (typeof Creator !== "undefined" && Creator.lastAbortReason) ? String(Creator.lastAbortReason).slice(0, 120) : "",
        /* هل انتهت تلاوة الصوت؟ وهل ظهرت نافذة التصدير؟
         * «0% ومرحلة فارغة» كانت تعني: الصفحة ما زالت تحضّر الصوت أصلًا. */
        prepared: Boolean(typeof Creator !== "undefined" && Creator.prepared),
        cache: (typeof AyahPlayer !== "undefined" && AyahPlayer.cache && typeof AyahPlayer.cache.size === "number") ? AyahPlayer.cache.size : null,
        overlay: (() => { const ov = document.getElementById("exportOverlay"); return Boolean(ov && ov.hidden === false); })(),
        /* صوت بديل صامت = فيديو بلا تلاوة؛ يجب أن يظهر في السبب لا أن يُنشر صامتًا */
        silent: Boolean(typeof AyahPlayer !== "undefined" && AyahPlayer.silent),
        prepErr: (typeof AyahPlayer !== "undefined" && AyahPlayer.lastPrepareError) ? String(AyahPlayer.lastPrepareError).slice(0, 120) : "",
      };
    }).catch(() => last);
    if (last.result) return last;
    const sig = `${last.pct}|${last.stage}`;
    if (sig !== prev) { prev = sig; lastChange = Date.now(); }
    if (Date.now() - lastChange > stallLimitMs) {
      throw exportError("stall", last, stallLimitMs);
    }
    await page.waitForTimeout(3000);
  }
  throw exportError("timeout", last, timeoutMs);
}

/* قراءة سبب التوقّف من الحالة نفسها بدل JSON مقطوع في منتصفه.
 * الدرس: الرسالة القديمة كانت تُقصّ عند 400 حرف فتُبتر قبل exporting/count/toast/abort —
 * أي قبل الحقول التي تحدد السبب، فبقي كل فشل «غير معروف» في القاعدة. */
function exportError(kind, last, ms) {
  const brief = [
    `pct=${last.pct || "0%"}`,
    `stage=${last.stage || "-"}`,
    `exporting=${last.exporting}`,
    `running=${last.running}`,
    `count=${last.count}`,
    `prepared=${last.prepared}`,
    `cache=${last.cache}`,
    `overlay=${last.overlay}`,
    `silent=${last.silent}`,
    `prep=${last.prepErr || "-"}`,
    `dialog=${last.dialog}`,
    `toast=${last.toast || "-"}`,
    `abort=${last.abort || "-"}`,
  ].join(" · ");
  const head = kind === "stall"
    ? `توليد الفيديو توقّف عند «${last.stage || "غير معروف"}» (${last.pct || "0%"}) بلا تقدّم ${Math.round(ms / 1000)}s`
    : `توليد الفيديو لم يكتمل خلال ${Math.round(ms / 1000)}s`;
  const err = new Error(`${head} — ${brief}`.slice(0, 600));
  err.diag = { kind, stage: last.stage || "", pct: last.pct || "", last };
  return err;
}

/* لقطة تشخيص كاملة عند الفشل: العناصر المطلوبة موجودة/ظاهرة؟ هل بدأ التصدير؟
 * ما حالة الصوت؟ ما أخطاء الصفحة؟ تُحفظ في system_checks.detail (jsonb) بلا قصّ. */
async function collectDiag(page, diag = {}) {
  const base = {
    errors: Array.isArray(diag.errors) ? diag.errors.slice(0, 12) : [],
    failed: Array.isArray(diag.failed) ? diag.failed.slice(0, 12) : [],
    steps: Array.isArray(diag.steps) ? diag.steps.slice(0, 20) : [],
    at: new Date().toISOString(),
  };
  if (!page || typeof page.evaluate !== "function") return base;
  const snap = await page.evaluate((ids) => {
    const txt = (id) => (document.getElementById(id)?.textContent || "").trim().slice(0, 120);
    const vis = (id) => { const el = document.getElementById(id); return Boolean(el && el.offsetParent !== null); };
    const present = {};
    ids.forEach((id) => { present[id] = { exists: Boolean(document.getElementById(id)), visible: vis(id), text: txt(id) }; });
    const toastEl = document.querySelector(".toast");
    return {
      url: String(location.href).slice(0, 200),
      present,
      exporting: typeof Creator !== "undefined" ? Boolean(Creator.exporting) : "no-Creator",
      abort: typeof Creator !== "undefined" && Creator.lastAbortReason ? String(Creator.lastAbortReason).slice(0, 160) : "",
      count: typeof Selection !== "undefined" && Selection.count ? Number(Selection.count()) : null,
      toast: toastEl ? String(toastEl.textContent || "").trim().slice(0, 140) : "",
      dialog: Boolean(document.querySelector(".overlay [data-ok]")),
      audio: Array.from(document.querySelectorAll("audio")).slice(0, 3).map((a) => ({
        src: String(a.currentSrc || a.src || "").slice(0, 120),
        readyState: a.readyState,
        paused: a.paused,
        error: a.error ? a.error.code : null,
      })),
      audioCtx: typeof AyahPlayer !== "undefined" && AyahPlayer.ctx ? String(AyahPlayer.ctx.state) : "",
      sw: typeof navigator !== "undefined" && navigator.serviceWorker ? (navigator.serviceWorker.controller ? "controlled" : "none") : "unsupported",
      scripts: Array.from(document.querySelectorAll("script[src]")).map((s) => s.getAttribute("src")).filter((x) => /creator|publish|quran/.test(x)).slice(0, 8),
    };
  }, REQUIRED_PAGE_IDS).catch((e) => ({ error: String((e && e.message) || e).slice(0, 160) }));
  return { ...base, page: snap };
}

/* إن رفض المولّد البدء (رسالة تحقق أو اختيار فارغ) فلا معنى لانتظار 90s.
 * نقرأ التوست/العدّاد مرة واحدة ونرمي السبب الحقيقي فورًا. */
async function assertExportStarted(page, { tries = 12, gapMs = 400 } = {}) {
  const read = () => page.evaluate(() => {
    const toastEl = document.querySelector(".toast");
    return {
      exporting: Boolean(typeof Creator !== "undefined" && Creator.exporting),
      running: Boolean(document.getElementById("expRunning") && document.getElementById("expRunning").offsetParent !== null),
      toast: (toastEl && toastEl.textContent ? toastEl.textContent : "").trim().slice(0, 100),
      count: (typeof Selection !== "undefined" && Selection.count) ? Number(Selection.count()) : null,
      abort: (typeof Creator !== "undefined" && Creator.lastAbortReason) ? String(Creator.lastAbortReason).slice(0, 120) : "",
    };
  }).catch(() => null);
  /* الضغط على #btnCreate يبدأ startExport غير متزامنًا (await Quran.load)، فقراءة
   * فورية كانت ترى exporting=false وتظن أن المولّد رفض — وأي تنبيه قديم من
   * تشغيل سابق («تم إنشاء الفيديو بنجاح») كان يُقرأ كرفض. ننتظر قليلًا ونقرأ
   * حتى يبدأ التصدير فعلًا، ثم نحكم على السبب الحقيقي. */
  let st = await read();
  for (let i = 0; i < tries && (!st || !(st.exporting || st.running)); i++) {
    try { await page.waitForTimeout(gapMs); } catch { /* صفحة اختبار بلا مؤقّت */ }
    const next = await read();
    if (next) st = next;
  }
  if (!st || st.exporting || st.running) return st;
  const stale = /تم إنشاء الفيديو|بنجاح|جارٍ/.test(String(st.toast || ""));
  if (stale) st.toast = "";
  /* السبب الذي سجّلته الصفحة نفسها أدقّ من تخميننا */
  if (st.abort) throw new Error(`المولّد لم يبدأ التصدير: «${st.abort}»`);
  if (st.count !== null && st.count < 1) {
    throw new Error(`لم تُحدَّد أي آية قبل البدء (count=${st.count})${st.toast ? " — " + st.toast : ""}`);
  }
  if (st.toast) throw new Error(`المولّد رفض بدء التصدير: «${st.toast}»`);
  return st;
}

/* حوارات التأكيد (مثل «المدة طويلة») قد تظهر متأخرة بعد تحضير الصوت.
 * كان الكود يجرّب الضغط عليها مرة واحدة بعد ٩٠٠ms، فإن تأخّرت بقي التسجيل
 * معلّقًا بلا نهاية (تشغيل 2026-11-11 14:22: overlay لم يُفتح إطلاقًا). */
async function acceptDialogs(page, windowMs = 20000) {
  const until = Date.now() + windowMs;
  while (Date.now() < until) {
    const clicked = await page.evaluate(() => {
      const btn = document.querySelector(".overlay [data-ok]");
      if (!btn) return false;
      btn.click();
      return true;
    }).catch(() => false);
    if (clicked) return true;
    await page.waitForTimeout(750);
  }
  return false;
}

/* ------------------------------------------------------------
 * تحميل التلاوة من داخل الدالة نفسها (لا عبر /proxy)
 * ------------------------------------------------------------
 * الصفحة تجلب الملفات من `/proxy?u=https://everyayah.com/…`، والوسيط العام
 * كان يُرجع 500 لملفات audio/mpeg رغم أن JSON/HTML/الخطوط تمرّ، فتتوقف
 * المرحلة عند «جارٍ تحضير التلاوة… 0%» بلا خطأ ظاهر. هنا نعترض طلبات
 * الصوت في المتصفح ونخدمها من fetch الخادم مباشرة — نفس المضيف المسموح،
 * بلا وسيط، مع كاش داخل التشغيل الواحد.
 * ------------------------------------------------------------ */
const AUDIO_HOSTS = new Set(["everyayah.com", "www.everyayah.com", "qurango.net"]);
const AUDIO_MAX = 12 * 1024 * 1024;

async function fetchAudio(target, cache) {
  if (!target) return null;
  let tp;
  try { tp = new URL(String(target)); } catch { return null; }
  if (tp.protocol !== "https:" && tp.protocol !== "http:") return null;
  if (!AUDIO_HOSTS.has(tp.hostname.toLowerCase())) return null; /* لا نفتح وسيطًا مفتوحًا */
  const key = tp.toString();
  if (cache && cache.has(key)) return cache.get(key);
  const r = await fetch(key, {
    headers: { "User-Agent": "QuranReels/1.0 (+https://quran-reels-tau.vercel.app)", Accept: "audio/*,*/*" },
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) return null;
  const body = Buffer.from(await r.arrayBuffer());
  if (!body.length || body.length > AUDIO_MAX) return null;
  const got = { body, type: r.headers.get("content-type") || "audio/mpeg" };
  if (cache) cache.set(key, got);
  return got;
}

/* مسار الصوت: يعترض /proxy?u= و/api/proxy?u= ويخدمه من الخادم.
 * أي فشل ⇒ نترك الطلب يمرّ كما كان (لا نُعطّل الصفحة بسبب الاعتراض). */
async function installAudioRoute(page) {
  const cache = new Map();
  /* إحصاء يوضح بجملة واحدة: هل وصل الصوت أم لا — يُحفظ مع التشخيص */
  const stats = { ok: 0, miss: 0, pass: 0, lastMiss: "" };
  const isAudioRequest = (url) => {
    try {
      const u = new URL(String(url));
      return (u.pathname === "/proxy" || u.pathname === "/api/proxy") && Boolean(u.searchParams.get("u"));
    } catch { return false; }
  };
  const handler = async (route) => {
    let target = "";
    try { target = new URL(String(route.request().url())).searchParams.get("u") || ""; } catch { target = ""; }
    /* مضيف غير معروف ⇒ نمرّره كما هو (لا نفتح وسيطًا مفتوحًا ولا نُعطّل طلبًا مشروعًا) */
    let host = "";
    try { host = new URL(target).hostname.toLowerCase(); } catch { host = ""; }
    if (!host || !AUDIO_HOSTS.has(host)) {
      stats.pass++;
      try { await route.continue(); } catch { /* الطلب أُلغي */ }
      return;
    }
    let got = null;
    let why = "";
    try { got = await fetchAudio(target, cache); } catch (e) { why = String((e && e.message) || e).slice(0, 120); }
    if (got) {
      stats.ok++;
      try {
        await route.fulfill({
          status: 200,
          headers: {
            "content-type": got.type,
            "access-control-allow-origin": "*",
            "cache-control": "public, max-age=3600",
            "accept-ranges": "none",
          },
          body: got.body,
        });
      } catch { /* الطلب أُلغي */ }
      return;
    }
    /* فشل حقيقي: نردّ 502 فورًا بدل ترك الصفحة تنتظر /api/proxy (60s لكل آية).
     * هذا وحده كان يحوّل تعليقًا ٨٥ ثانية/آية إلى فشل فوري مع سبب. */
    stats.miss++;
    stats.lastMiss = (why || `تعذّر جلب ${target}`).slice(0, 200);
    try {
      await route.fulfill({
        status: 502,
        headers: { "content-type": "application/json", "access-control-allow-origin": "*", "x-audio-miss": "1" },
        body: JSON.stringify({ error: "audio-unavailable", target: target.slice(0, 200) }),
      });
    } catch {
      try { await route.abort(); } catch { /* الطلب أُلغي */ }
    }
  };
  try {
    await page.route(isAudioRequest, handler);
    return stats;
  } catch {
    return null;
  }
}

/* الفيديو يُصدَّر حتى لو فشل كل الصوت (وضع «صامت» يُبقي الصفحة تعمل).
 * للنشر الآلي هذا غير مقبول: فيديو تلاوة بلا تلاوة أسوأ من يوم بلا فيديو،
 * ويُخفي عطلًا حقيقيًا. نتحقّق بعد انتهاء التصدير (لحظة معرفة النتيجة) قبل
 * أي تنزيل أو رفع. */
async function assertAudioPresent(page) {
  const st = await page.evaluate(() => ({
    silent: Boolean(typeof AyahPlayer !== "undefined" && AyahPlayer.silent),
    cache: (typeof AyahPlayer !== "undefined" && AyahPlayer.cache && typeof AyahPlayer.cache.size === "number") ? AyahPlayer.cache.size : null,
    prepErr: (typeof AyahPlayer !== "undefined" && AyahPlayer.lastPrepareError) ? String(AyahPlayer.lastPrepareError).slice(0, 160) : "",
  })).catch(() => null);
  if (!st) return { silent: false, cache: null, prepErr: "", unknown: true };
  if (st.silent) {
    const err = new Error(`فشل تحميل التلاوة — لن يُنشر فيديو بلا صوت${st.prepErr ? ` (${st.prepErr})` : ""}`);
    err.diag = { kind: "silent", stage: "بعد التصدير", pct: "100%", last: { ...st, exporting: false, count: null } };
    throw err;
  }
  return st;
}

/* وصف قصير لنتيجة فحص الصوت يُقرأ في اللوحة بلا فكّ JSON */
function describeProbe(p) {
  if (!p) return "لا نتيجة";
  if (p.ok) return `ok ${p.status} ${p.bytes || 0}B ${p.ms || 0}ms`;
  return `${p.status ? "HTTP " + p.status : "فشل"}${p.error ? " " + p.error : ""} ${p.ms || 0}ms`;
}

/* فحص صوت المقطع المطلوب فعليًا (أول وآخر آية) عبر المسارين.
 * أول آية تكفي للحكم على المضيف، والثانية تكشف حجبًا جزئيًا لملفات طويلة. */
async function probeAudioForRecipe(recipe, reciter) {
  const folder = (reciter && reciter.id) || "Abdurrahmaan_As-Sudais_192kbps";
  const surah = Number(recipe && recipe.s) || 108;
  const first = Number(recipe && recipe.from) || 1;
  const last = Number(recipe && recipe.to) || first;
  const started = Date.now();
  const [direct, proxy] = await Promise.all([
    probeAudio({ folder, surah, ayah: first }),
    probeAudioViaProxy({ folder, surah, ayah: first }),
  ]);
  const out = { folder, surah, ayah: first, last_ayah: last, direct, proxy, ms: Date.now() - started };
  /* لو نجح الأول وفشل الأخير فهذا حجب جزئي يستحق التسجيل */
  if (direct.ok && last !== first) {
    out.direct_last = await probeAudio({ folder, surah, ayah: last });
  }
  return out;
}

async function renderRecipe(recipe, reciter, background, runIndex) {
  const { chromiumBin, playwright } = await renderDeps();
  const browser = await playwright.launch({
    executablePath: await chromiumBin.executablePath(),
    args: [...chromiumBin.args, ...LAUNCH_FLAGS],
    headless: true,
  });
  let context;
  let page = null;
  const diag = { errors: [], failed: [], steps: [] };
  const step = (name) => diag.steps.push(`${Math.round(Date.now() - t0)}ms ${name}`);
  const t0 = Date.now();
  try {
    context = await browser.newContext({ acceptDownloads: true, viewport: { width: 900, height: 1200 } });
    page = await context.newPage();
    page.setDefaultTimeout(45000);
    /* تشخيص مباشر: أخطاء الصفحة والطلبات الفاشلة تُحفظ مع سبب الفشل بدل تخمينه */
    if (typeof page.on === "function") {
      page.on("pageerror", (e) => { if (diag.errors.length < 12) diag.errors.push("pageerror: " + String((e && e.message) || e).slice(0, 200)); });
      page.on("console", (m) => { if (diag.errors.length < 12 && m && m.type && m.type() === "error") diag.errors.push("console: " + String(m.text() || "").slice(0, 200)); });
      page.on("requestfailed", (r) => { if (diag.failed.length < 12) diag.failed.push(String(r && r.url ? r.url() : "").slice(0, 140) + " — " + String((r && r.failure && r.failure() && r.failure().errorText) || "")); });
    }
    /* قبل أي طلب: خدّم الصوت من الخادم مباشرة بدل وسيط /proxy */
    const audioRoute = await installAudioRoute(page);
    /* فحص وصول التلاوة من الخادم قبل تشغيل المتصفح كله.
     * تعليقات 8–11 نوفمبر كانت كلها «0% بلا سبب»: الصفحة تنتظر 85 ثانية لكل
     * آية (25 داخل الاعتراض + 60 في /api/proxy) حتى تنفد المهلة. الآن نعرف
     * الحقيقة في ≤20 ثانية ونجعل الفشل يرثي بصوته: مصدر التلاوة نفسه. */
    const audioProbe = await probeAudioForRecipe(recipe, reciter);
    audioProbe.route = audioRoute; /* مرجع حيّ: يُقرأ عند الفشل بعدة عدّادات محدّثة */
    diag.audio = audioProbe;
    if (!audioProbe.direct.ok && !audioProbe.proxy.ok) {
      throw new Error(
        `التلاوة غير متاحة من الخادم: مباشر=${describeProbe(audioProbe.direct)} · وسيط=${describeProbe(audioProbe.proxy)}`
      );
    }
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

    /* المدة > 4 دقائق تُنتج حوار «المدة طويلة» وتعليقًا في الوضع الآلي.
     * نقلّص عدد الآيات مسبقًا حتى لا يظهر الحوار أصلًا. */
    try {
      await page.evaluate(() => {
        if (typeof AyahPlayer === "undefined" || typeof Selection === "undefined" || !AyahPlayer.totalDuration) return;
        const total = Number(AyahPlayer.totalDuration()) || 0;
        const count = Number(Selection.count()) || 0;
        if (!total || total <= 240 || count < 2) return;
        const keep = Math.max(1, Math.floor((240 / total) * count));
        Selection.to = Selection.from + keep - 1;
        const el = document.getElementById("txtTo");
        if (el) { el.value = String(Selection.to); el.dispatchEvent(new Event("change", { bubbles: true })); }
      });
    } catch { /* ليس حرجًا */ }

    // Warm the Web Audio context, then stop the preview before the full capture.
    await page.bringToFront().catch(() => {});
    step("warm-audio");
    await page.click("#btnPlay").catch(() => {});
    await page.waitForTimeout(1400);
    await page.click("#btnPlay").catch(() => {});
    await page.waitForTimeout(250);
    await page.locator("#btnCreate").scrollIntoViewIfNeeded();
    step("click-create");
    /* تنبيه من محاولة سابقة يبقى في DOM ويُقرأ كرفض — نمسحه قبل البدء */
    await page.evaluate(() => { document.querySelectorAll(".toast").forEach((t) => t.remove()); }).catch(() => {});
    await page.click("#btnCreate", { timeout: 45000 });
    const dialog = await acceptDialogs(page, 20000);
    step("dialogs=" + dialog);
    await assertExportStarted(page);
    step("export-started");
    await waitForExport(page, 210000, 90000);
    step("export-done");
    /* حارس المنتج: لا ننشر فيديو صامتًا أبدًا */
    diag.audio_loaded = await assertAudioPresent(page);
    step("audio-ok");
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
  } catch (error) {
    /* نُرفق لقطة الصفحة بالخطأ نفسه كي تُحفظ مع التشغيل الفاشل */
    try {
      const snap = await collectDiag(page, diag);
      if (error && typeof error === "object") error.diag = { ...(error.diag || {}), ...snap };
      else throw error;
    } catch { /* لا نُخفي الخطأ الأصلي */ }
    throw error;
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

async function createRun(userId, runType, runDate, article = null, keySuffix = "", reuseFailed = false) {
  const base = runType === "daily" ? `daily:${userId}:${runDate}` : `manual:${userId}:${crypto.randomUUID()}`;
  const runKey = keySuffix ? `${base}:${keySuffix}` : base;
  const prior = await q1(`select * from autopilot_runs where run_key=$1 limit 1`, [runKey]);
  if (prior) {
    /* إعادة المحاولة كانت تُعاد بلا فعل: المحاولة الثانية تجد صفّ المحاولة
     * الأولى (failed) فترجع duplicate:true وتنتهي — أي أن «الإعادة التلقائية»
     * لم تُولّد شيئًا قط. نسمح باستكمال الصفّ فقط إذا فشل قبل أي نشر
     * (لا رابط ولا صفّ في قائمة النشر)، حتى لا نُنشئ منشورًا مكرّرًا. */
    const resumable = Boolean(reuseFailed) && prior.status === "failed" && !prior.external_url && !prior.publish_queue_id;
    if (!resumable) return { existing: true, run: prior };
    try {
      await patchRun(prior.id, { status: "rendering", error: null, completed_at: null, started_at: new Date().toISOString() });
    } catch { return { existing: true, run: prior }; }
    return { existing: false, resumed: true, run: { ...prior, status: "rendering", error: null } };
  }
  
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
/* ------------------------------------------------------------
 * أهداف النشر: قناة واحدة أم كل القنوات؟
 * ------------------------------------------------------------
 * all_channels=false (الافتراضي): مهمة واحدة لكل منصة بلا connection_id،
 * فيختار الخادم القناة الافتراضية (⭐) — نفس السلوك السابق.
 * all_channels=true: مهمة لكل قناة مرتبطة، كل واحدة بـ connection_id،
 * فيُنشر الفيديو على كل قنواتها (مثال: قناتا يوتيوب) بلا تدخّل.
 * ------------------------------------------------------------ */
function planTargets(platforms, connsByPlatform = {}, allChannels = false) {
  const out = [];
  for (const platform of Array.isArray(platforms) ? platforms : []) {
    if (!allChannels) { out.push({ platform, connection_id: null }); continue; }
    const rows = Array.isArray(connsByPlatform[platform]) ? connsByPlatform[platform].filter(Boolean) : [];
    if (!rows.length) { out.push({ platform, connection_id: null }); continue; }
    for (const c of rows) out.push({ platform, connection_id: c.id ? String(c.id) : null });
  }
  return out;
}

/* كل قنوات المنصة لمستخدم (مع is_default لتمييز الافتراضية في الواجهة) */
async function connectionsFor(userId, platform) {
  try {
    const rows = await rest(`/rest/v1/social_connections?user_id=eq.${encodeURIComponent(userId)}&select=id,platform,account_name,is_default`);
    const list = Array.isArray(rows) ? rows : [];
    const want = platform === "instagram" ? ["instagram", "facebook"] : [platform];
    return list.filter((r) => want.includes(r.platform));
  } catch { return []; }
}

async function generateAndPublish(userId, { runType = "manual", config = null, article = null, runKeySuffix = "", reuseFailed = false, runDate: dayOverride = null } = {}) {
  const row = config || await getConfig(userId);
  const template = parseTemplate(row?.template);
  /* يوم صريح للتعويض (backfill) وإلا يوم القاهرة الحالي */
  const runDate = dayOverride && /^\d{4}-\d{2}-\d{2}$/.test(String(dayOverride)) ? String(dayOverride) : cairoDate();
  
  // دمج المقال إذا وُجد
  const runConfig = article ? { ...row, template: { ...template, content_mode: "article" }, article } : row;
  
  const { existing, run, resumed } = await createRun(userId, runType, runDate, article, runKeySuffix, reuseFailed);
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
    /* كل القنوات إن طُلب ذلك، وإلا مهمة واحدة للمنصة (القناة الافتراضية) */
    const connsByPlatform = {};
    if (runConfig?.all_channels === true) {
      for (const platform of platforms) connsByPlatform[platform] = await connectionsFor(userId, platform);
    }
    const targets = planTargets(platforms, connsByPlatform, runConfig?.all_channels === true);

    const insertPromises = targets.map(async (target) => {
      const { platform, connection_id } = target;
      const meta = metadata(recipe, reciter, platform);
      const inserted = await rest("/rest/v1/publish_queue", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          user_id: userId, platform, connection_id, video_path: storagePath, video_name: rendered.filename,
          title: meta.title, caption: meta.caption, hashtags: meta.hashtags,
          status: "scheduled", publish_at: new Date().toISOString(),
        }),
      });
      return { platform, connection_id, row: Array.isArray(inserted) ? inserted[0] : inserted };
    });

    const insertedRows = await Promise.all(insertPromises);
    queueRows = insertedRows.map(i => i.row);

    // نشر متوازي
    const publishPromises = insertedRows.map(async (i) => {
      const out = await publishRow(i.row);
      if (!out.ok) throw new Error(`${i.platform}: ${out.error || "فشل النشر"}`);
      return { platform: i.platform, connection_id: i.connection_id || null, url: out.url };
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
    const message = String(error?.message || error).slice(0, 800);
    await patchRun(run.id, { status: "failed", error: message.slice(0, 500), completed_at: new Date().toISOString() }).catch(() => {});
    await recordRenderFailure(userId, run, error, message);
    return { ok: false, run_id: run.id, error: message.slice(0, 300) };
  } finally {
    if (runType === "daily") await updateAutopilotHeartbeat(userId);
  }
}

/* سبب الفشل الكامل في system_checks بدل صفّ خطأ مقصوص.
 * يُحفظ diag (عناصر الصفحة، حالة الصوت، أخطاء الكونسول، خطوات النقر) كاملًا
 * في عمود jsonb، فتصبح كل تشغيلة فاشلة تشخيصًا جاهزًا لا لغزًا. */
async function recordRenderFailure(userId, run, error, message) {
  try {
    const diag = (error && typeof error === "object" && error.diag) ? error.diag : {};
    await rest("/rest/v1/system_checks", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        kind: "render_failure",
        ok: false,
        detail: {
          user_id: String(userId || "").slice(0, 40),
          run_id: String((run && run.id) || "").slice(0, 40),
          run_key: String((run && run.run_key) || "").slice(0, 80),
          error: String(message || "").slice(0, 800),
          diag,
          at: new Date().toISOString(),
        },
      }),
    });
    return true;
  } catch { return false; }
}

/* إعادة محاولة واحدة تلقائيًا ضمن ميزانية زمنية (الدالة محدودة بـ300 ثانية).
 * أكثر أعطالنا كانت عارضة (حوار متأخر، صوت متعثّر)، ومحاولة ثانية تكفي
 * بدل أن يضيع اليوم كله ويحتاج المستخدم تدخّلًا. */
async function runWithRetry(attempt, { budgetMs = 150000, clock = () => Date.now() } = {}) {
  const t0 = clock();
  let result = null;
  try { result = await attempt(1); } catch (error) { result = { ok: false, error: String((error && error.message) || error).slice(0, 300) }; }
  let attempts = 1;
  if (result && result.ok === false && clock() - t0 < budgetMs) {
    await new Promise((r) => setTimeout(r, 2000)); /* مهلة قصيرة قبل المحاولة الثانية */
    try { result = await attempt(2); } catch (error) { result = { ok: false, error: String((error && error.message) || error).slice(0, 300) }; }
    attempts = 2;
  }
  return { result, attempts };
}

/* تسجيل نتيجة التشغيل اليومي في system_checks (تاريخ يُقرأ بلا لقطة شاشة) */
async function recordDaily(userId, result, attempts) {
  try {
    await rest("/rest/v1/system_checks", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        kind: "autopilot_daily",
        ok: Boolean(result && result.ok),
        detail: {
          user_id: String(userId).slice(0, 40),
          attempts,
          run_id: String((result && result.run_id) || "").slice(0, 40),
          url: String((result && (result.url || (result.urls && result.urls[0]))) || "").slice(0, 300),
          error: String((result && result.error) || "").slice(0, 300),
          ...(result && result.backfill ? { backfill: String(result.backfill).slice(0, 10) } : {}),
          at: new Date().toISOString(),
        },
      }),
    });
    return true;
  } catch { return false; }
}

/* ------------------------------------------------------------
 * فحص سلامة النسخة المنشورة قبل أي توليد
 * ------------------------------------------------------------
 * درس 2026-11-11: سقطت كتلة #exportOverlay من الماركب بينما بقي الكود
 * يفتحها، فكان كل تشغيل يحرق ٣٠٠ ثانية ثم يفشل بلا سبب. الفحص هنا يقرأ
 * صفحة الإنتاج (نص HTML فقط) ويتأكد من وجود عناصر التصدير وإصدارات
 * السكربتات قبل إطلاق المتصفح — ثانية واحدة بدل خمس دقائق عمياء.
 * ------------------------------------------------------------ */
const REQUIRED_PAGE_IDS = ["exportOverlay", "expPct", "expStage", "expRunning", "expResult", "btnCancelExport"];

async function preflightPage() {
  const started = Date.now();
  try {
    const res = await fetch(`${SITE()}/`, {
      headers: { "User-Agent": "QuranReels-preflight/1.0", "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, status: res.status, missing: [], error: `الصفحة ردّت ${res.status}` , ms: Date.now() - started };
    const html = await res.text();
    const missing = REQUIRED_PAGE_IDS.filter((id) => !new RegExp(`id="${id}"`).test(html));
    const version = (name) => { const m = html.match(new RegExp(`${name}[.]js[?]v=(\\d+)`)); return m ? Number(m[1]) : 0; };
    return {
      ok: missing.length === 0,
      status: res.status,
      missing,
      versions: { creator: version("creator"), quran: version("quran"), publish: version("publish") },
      ms: Date.now() - started,
      error: missing.length ? `نسخة الإنتاج تفتقد: ${missing.join(", ")}` : "",
    };
  } catch (error) {
    return { ok: false, status: 0, missing: [], error: String((error && error.message) || error).slice(0, 200), ms: Date.now() - started };
  }
}

/* تشغيلات عالقة من محاولات فاشلة سابقة (بقيت rendering للأبد)
 * تُغلق تلقائيًا حتى لا يظنّ المستخدم أن شيئًا يعمل. */
async function closeStaleRuns(minutes = 45) {
  try {
    await q(
      `update autopilot_runs set status='failed', error=$1, completed_at=now()
       where status='rendering' and created_at < now() - ($2 || ' minutes')::interval`,
      ["أُغلقت تلقائيًا: تجاوزت المهلة بلا نتيجة (تنظيف تلقائي)", String(minutes)]
    );
    return true;
  } catch { return false; }
}

async function runDailyAutopilots() {
  const configs = await q(`select * from autopilot where enabled='true' order by updated_at asc limit 3`);
  const list = Array.isArray(configs) ? configs.filter(a => Array.isArray(a.platforms) && a.platforms.length > 0) : [];
  if (!list.length) return [];
  await closeStaleRuns(); /* لا نترك تشغيلات الأمس عالقة */
  /* فحص النسخة المنشورة أولًا: لا نحرق ميزانية ٣٠٠ ثانية على صفحة ناقصة */
  const pre = await preflightPage();
  if (!pre.ok) {
    const error = `فحص النسخة المنشورة فشل: ${pre.error}`;
    for (const config of list) await recordDaily(config.user_id, { ok: false, error }, 0);
    return [{ ok: false, preflight: pre, results: [], error }];
  }
  const results = [];
  for (const config of list) {
    const { result, attempts } = await runWithRetry((n) => generateAndPublish(config.user_id, { runType: "daily", config, reuseFailed: n > 1 }));
    const recorded = await recordDaily(config.user_id, result, attempts);
    results.push({ user_id: config.user_id, ...result, attempts, recorded, preflight: pre });
  }
  return results;
}

/* ------------------------------------------------------------
 * شبكة أمان: هل يحتاج اليوم تشغيلًا بديلًا؟
 * ------------------------------------------------------------
 * الخطة الحالية تسمح بكرون واحد يوميًا، فأي فشل مزدوج يعني يومًا بلا فيديو.
 * هذا الفحص يقرأ تشغيلات تاريخ اليوم (القاهرة): منشور ⇒ لا شيء، قيد الإنشاء
 * ⇒ لا نُزاحمه، وإلا ⇒ نُشغّل محاولة إنقاذ واحدة (run_key ‎:retry1‎).
 * ------------------------------------------------------------ */
function shouldCatchUp(runs) {
  const list = Array.isArray(runs) ? runs : [];
  if (list.some((r) => r && r.status === "published")) return "published";
  if (list.some((r) => r && r.status === "rendering")) return "running";
  return "go";
}

/* هل نُشر فعليًا شيء لهذا اليوم؟ صفّ التشغيل قد يبقى failed بينما نجح
 * النشر على منصة وفشل على أخرى. بدون هذا الفحص تُعيد إعادة التوليد/التعويض
 * نشر المقطع نفسه على المنصة التي نجحت — أي منشور مكرّر لا رجعة فيه. */
async function dayHasPublish(userId, day) {
  try {
    const rows = await q(
      `select id from publish_queue where user_id=$1 and video_path like $2 and status='published' limit 1`,
      [userId, `%/autopilot/${day}-%`]
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch { return false; }
}

/* شبكة أمان ثانية: إن نجح الرندر وفشل النشر فقط، لا نُعيد التوليد.
 * إعادة التوليد تكلّف ~٥ دقائق، وقد تُنشر نفس المقطع مرتين على منصة نجحت
 * في المرة الأولى. هنا نعيد النشر لصفوف فشلت فقط لنفس يوم التشغيل.
 * النتيجة: null (لا شيء لنتابعه) أو {attempted, published[], failed}. */
async function retryPublishFailed(userId, runDate) {
  let rows = [];
  try {
    rows = await q(
      `select id, platform, connection_id, video_path, video_name, title, caption, hashtags, status
         from publish_queue
        where user_id=$1 and video_path like $2 and status='failed'
        order by publish_at asc nulls last limit 5`,
      [userId, `%/autopilot/${runDate}-%`]
    );
  } catch { return null; }
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return null;
  const published = [];
  let failed = 0;
  for (const row of list) {
    const out = await publishRow(row, row.platform).catch(() => ({ ok: false }));
    if (out && out.ok) published.push({ platform: row.platform, url: out.url });
    else failed++;
  }
  return { attempted: list.length, published, failed };
}

async function catchUpDaily() {
  const configs = await q(`select * from autopilot where enabled='true' order by updated_at asc limit 3`);
  const list = Array.isArray(configs) ? configs.filter((a) => Array.isArray(a.platforms) && a.platforms.length > 0) : [];
  const out = [];
  if (!list.length) return out;
  /* تنظيف قبل الحكم: تشغيل أساسي قُتل في منتصف الرندر (مهلة ٣٠٠ ثانية) يبقى
   * 'rendering'، فيقرأه الإنقاذ «جارٍ» ويتخطاه — فيضيع اليوم بالضبط في الحالة
   * التي وُجد الإنقاذ من أجلها. أي تشغيل معلّق أقدم من ٢٠ دقيقة = فاشل. */
  await closeStaleRuns(20).catch(() => {});
  const runDate = cairoDate();
  let pre = null;
  for (const config of list) {
    let rows = [];
    try {
      rows = await rest(`/rest/v1/autopilot_runs?user_id=eq.${encodeURIComponent(config.user_id)}&run_date=eq.${encodeURIComponent(runDate)}&select=id,status,run_key`);
    } catch { rows = []; }
    const verdict = shouldCatchUp(rows);
    if (verdict === "published") { out.push({ user_id: config.user_id, skipped: "published" }); continue; }
    if (verdict === "running") { out.push({ user_id: config.user_id, skipped: "running" }); continue; }
    /* نُشر شيء لهذا اليوم بالفعل (ولو فشل صفّ التشغيل) ⇒ لا توليد ولا تكرار نشر */
    if (await dayHasPublish(config.user_id, runDate).catch(() => false)) {
      try {
        await q(`update autopilot_runs set status='published', completed_at=now(), error=null where user_id=$1 and run_date=$2 and status <> 'published'`, [config.user_id, runDate]);
      } catch { /* يُصحَّح لاحقًا */ }
      await recordDaily(config.user_id, { ok: true, resumed: true, url: "" }, 0);
      out.push({ user_id: config.user_id, ok: true, skipped: "published-cached", resumed: true });
      continue;
    }
    /* قبل حرق ٥ دقائق في إعادة التوليد: ربما الفيديو جاهز والنشر وحده فشل */
    const retried = await retryPublishFailed(config.user_id, runDate).catch(() => null);
    if (retried && retried.published.length > 0) {
      const urls = retried.published.map((p) => p.url).filter(Boolean).join(" | ");
      const fully = retried.failed === 0;
      if (fully) {
        try {
          await q(`update autopilot_runs set status='published', external_url=$3, error=null, completed_at=now() where user_id=$1 and run_date=$2 and status <> 'published'`, [config.user_id, runDate, urls]);
        } catch { /* الصفّ يُصحَّح لاحقًا */ }
        await recordDaily(config.user_id, { ok: true, url: urls, resumed: true }, 0);
        out.push({ user_id: config.user_id, ok: true, url: urls, resumed: true, skipped: "rendered-cached", retried: retried.attempted });
      } else {
        const error = `نُشر جزء من اليوم (${retried.published.length}/${retried.attempted}) وفشل الباقي — لن نُعيد التوليد كي لا يتكرر المنشور`;
        await recordDaily(config.user_id, { ok: false, error }, 0);
        out.push({ user_id: config.user_id, ok: false, skipped: "partial-publish", error, retried: retried.attempted });
      }
      continue;
    }
    if (!pre) pre = await preflightPage();
    if (!pre.ok) {
      await recordDaily(config.user_id, { ok: false, error: `إنقاذ: فحص النسخة فشل — ${pre.error}` }, 0);
      out.push({ user_id: config.user_id, ok: false, skipped: "preflight", error: pre.error });
      continue;
    }
    const { result, attempts } = await runWithRetry((n) => generateAndPublish(config.user_id, { runType: "daily", config, runKeySuffix: "retry1", reuseFailed: n > 1 }));
    await recordDaily(config.user_id, result, attempts);
    out.push({ user_id: config.user_id, ...result, attempts, catchup: true });
  }
  return out;
}

/* تعويض أقرب يوم ناقص — خطوة واحدة فقط في التشغيل الواحد (الميزانية ٣٠٠ ثانية).
 * لا تعمل إلا بعد التأكد أن «اليوم» ليس ناقصًا: لا نُضحّي باليوم الحاضر من أجل ماضٍ.
 * لكل يوم مُعوّض مفتاح خاص `daily:<uid>:<day>:backfill` فلا يتكرر ولا يصطدم
 * بالتشغيل اليومي، وفشله لا يُعاد كل ساعة (نتذكّر المحاولة عبر المفتاح). */
async function backfillDaily({ lookback = 2 } = {}) {
  const configs = await q(`select * from autopilot where enabled='true' order by updated_at asc limit 1`);
  const config = Array.isArray(configs) ? configs[0] : null;
  if (!config || !Array.isArray(config.platforms) || config.platforms.length === 0) return [];
  const userId = config.user_id;
  const today = cairoDate();
  const since = dayShift(today, -Math.max(1, Number(lookback) || 2));
  let rows = [];
  try {
    rows = await rest(`/rest/v1/autopilot_runs?user_id=eq.${encodeURIComponent(userId)}&run_date=gte.${encodeURIComponent(since)}&select=run_date,status,run_key`);
  } catch { return [{ skipped: "db-unavailable" }]; }
  const list = Array.isArray(rows) ? rows : [];
  const todayRows = list.filter((r) => String(r.run_date).slice(0, 10) === today);
  if (shouldCatchUp(todayRows) !== "published") return [{ user_id: userId, skipped: "today-pending" }];
  const [day] = missingDays(list, today, lookback);
  if (!day) return [{ user_id: userId, skipped: "nothing-missing" }];
  /* صفّ منشور في القائمة يعني أن اليوم غطّى نفسه ولو فشل صفّ التشغيل */
  if (await dayHasPublish(userId, day).catch(() => false)) {
    return [{ user_id: userId, day, skipped: "already-published" }];
  }
  const pre = await preflightPage();
  if (!pre.ok) {
    await recordDaily(userId, { ok: false, error: `تعويض ${day}: فحص النسخة فشل — ${pre.error}` }, 0);
    return [{ user_id: userId, ok: false, skipped: "preflight", day, error: pre.error }];
  }
  const { result, attempts } = await runWithRetry((n) => generateAndPublish(userId, {
    runType: "daily", config, runDate: day, runKeySuffix: "backfill", reuseFailed: n > 1,
  }));
  await recordDaily(userId, { ...result, backfill: day }, attempts);
  return [{ user_id: userId, day, backfill: true, run_key: `daily:${userId}:${day}:backfill`, ...result, attempts }];
}

/* فحص تشغيل المتصفح — يُستدعى من لوحة الحساب (action: selftest_render).
 * الغرض: تحويل «هل يعمل التوليد على Vercel؟» من تخمين إلى إجابة بأزرار واحدة،
 * مع تقرير كامل (مسار التنفيذ، وجود Creator، زمن التشغيل، نص الخطأ الحقيقي).
 * لا يُنشئ فيديو ولا ينشر شيئًا. */
/* نفس التلاوة لكن عبر مسار المتصفح الفعلي (/api/proxy) — الفرق بين المسارين
 * هو ما يحدد إن كان التعليق في المصدر أم في الوسيط. */
async function probeAudioViaProxy({ folder = "Abdurrahmaan_As-Sudais_192kbps", surah = 108, ayah = 1 } = {}) {
  const src = audioUrlFor(folder, surah, ayah);
  const url = `${SITE()}/api/proxy?u=${encodeURIComponent(src)}`;
  const started = Date.now();
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-2047" }, signal: AbortSignal.timeout(20000) });
    const text = res.ok ? "" : (await res.text().catch(() => "")).slice(0, 120);
    let bytes = 0;
    if (res.ok) { const buf = await res.arrayBuffer().catch(() => null); bytes = buf ? buf.byteLength : 0; }
    return {
      ok: res.ok,
      status: res.status,
      type: res.headers.get("content-type") || "",
      bytes,
      ms: Date.now() - started,
      detail: text || undefined,
    };
  } catch (error) {
    return { ok: false, error: String(error?.message || error).slice(0, 200), ms: Date.now() - started };
  }
}

/* فحص وصول التلاوة من الخادم — أكثر فرضية محتملة لتعليق التصدير.
 * الواجهة تجلب الصوت من everyayah.com عبر /proxy؛ إن تعذّر الوصول من بيئة
 * Vercel تبقى المرحلة عند «جارٍ تحضير التلاوة… 0%» بلا أي خطأ ظاهر.
 * هذه الدالة تطلب أول 2KB من الملف نفسه وتُعيد الحالة والزمن. */
const pad3 = (n) => String(n).padStart(3, "0");
function audioUrlFor(folder, surah, ayah) {
  return `https://everyayah.com/data/${folder}/${pad3(surah)}${pad3(ayah)}.mp3`;
}
async function probeAudio({ folder = "Abdurrahmaan_As-Sudais_192kbps", surah = 108, ayah = 1 } = {}) {
  const url = audioUrlFor(folder, surah, ayah);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { Range: "bytes=0-2047" },
      signal: AbortSignal.timeout(15000),
    });
    let bytes = 0;
    try {
      const buf = await res.arrayBuffer();
      bytes = buf.byteLength;
    } catch { /* تجاهل */ }
    return {
      ok: res.ok || res.status === 206,
      status: res.status,
      type: res.headers.get("content-type") || "",
      bytes,
      ms: Date.now() - started,
      url,
    };
  } catch (error) {
    return { ok: false, error: String(error?.message || error).slice(0, 200), ms: Date.now() - started, url };
  }
}

async function renderSelfTest({ deep = false } = {}) {
  /* الفحص يبدأ بتأكيد أن النسخة المنشورة تحمل عناصر التصدير (درس 2026-11-11) */
  const preflight = await preflightPage();
  const started = Date.now();
  const report = {
    node: process.versions.node,
    vercel: Boolean(process.env.VERCEL),
    ld_library_path: process.env.LD_LIBRARY_PATH || null,
    deep: Boolean(deep),
  };
  let browser = null;
  try {
    const { chromiumBin, playwright } = await renderDeps();
    report.executable_path = await chromiumBin.executablePath();
    browser = await playwright.launch({
      executablePath: report.executable_path,
      args: [...chromiumBin.args, ...LAUNCH_FLAGS],
      headless: true,
    });
    const page = await browser.newPage();
    await installAudioRoute(page);
    /* نسجّل أخطاء الصفحة والطلبات الفاشلة داخل المتصفح — بها يظهر سبب التعليق
     * (مثل فشل تحميل التلاوة) بدل انتظار مهلة صامتة. */
    const pageErrors = [];
    const failedRequests = [];
    try {
      page.on("console", (m) => { if (m.type() === "error" && pageErrors.length < 6) pageErrors.push(String(m.text()).slice(0, 160)); });
      page.on("requestfailed", (r) => {
        if (failedRequests.length < 6) failedRequests.push(`${String(r.url()).slice(0, 120)} :: ${(r.failure() && r.failure().errorText) || ""}`);
      });
    } catch { /* نسخ playwright القديمة */ }
    /* وصول التلاوة من الخادم مباشرة (لا من المتصفح) وعبر /api/proxy */
    report.audio_direct = await probeAudio();
    report.audio_proxy = await probeAudioViaProxy();
    await page.goto(`${SITE()}/?selftest=1`, { waitUntil: "domcontentloaded", timeout: 30000 });
    report.page_title = await page.title();
    report.creator_ready = await page.evaluate(() => typeof Creator !== "undefined" && Boolean(Creator.ready)).catch(() => false);

    /* الفحص العميق: توليد فيديو حقيقي قصير (سورة الكوثر، آية واحدة) بلا رفع ولا نشر.
     * الغرض: إثبات أن مسار التسجيل كاملًا يعمل على الخادم، لا مجرد فتح الصفحة —
     * وهو الفرق بين «chromium يقلع» و«الفيديو يُنتج». */
    if (deep) {
      const t0 = Date.now();
      await page.evaluate(() => {
        const fire = (id, v) => { const el = document.getElementById(id); if (!el) return; el.value = String(v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
        const s = document.getElementById("selSurah");
        if (s) { s.value = "108"; s.dispatchEvent(new Event("change", { bubbles: true })); }
        fire("txtFrom", 1); fire("txtTo", 1);
        if (typeof Selection !== "undefined") { Selection.ratio = "9:16"; Selection.save(); }
      });
      await page.bringToFront().catch(() => {});
      await page.click("#btnPlay").catch(() => {});
      await page.waitForTimeout(1200);
      await page.click("#btnPlay").catch(() => {});
      await page.waitForTimeout(250);
      await page.click("#btnCreate", { timeout: 45000 });
      await acceptDialogs(page, 20000);
      await assertExportStarted(page);
      const state = await waitForExport(page, 150000, 75000);
      report.export = {
        ok: Boolean(state.result),
        pct: state.pct || "",
        stage: state.stage || "",
        meta: state.meta || "",
        ms: Date.now() - t0,
      };
      report.page_errors = pageErrors.slice(0, 6);
      report.failed_requests = failedRequests.slice(0, 6);
    }
    report.ok = true;
  } catch (error) {
    report.ok = false;
    report.error = String(error?.message || error).slice(0, 400);
  } finally {
    try { if (browser) await browser.close(); } catch { /* تجاهل */ }
  }
  report.preflight = preflight;
  report.ms = Date.now() - started;
  return report;
}

/* ------------------------------------------------------------
 * حفظ نتيجة الفحص في system_checks
 * ------------------------------------------------------------
 * نتيجة الفحص كانت تُقرأ مرة واحدة في اللوحة ثم تضيع. تخزينها يجعل
 * «هل التوليد يعمل الآن؟» سؤالًا له سجل بدل لقطة شاشة.
 * التخزين أفضل جهد: فشله لا يُفشل الفحص.
 * ------------------------------------------------------------ */
const clip = (v, n = 300) => String(v == null ? "" : v).slice(0, n);

function probeBrief(p) {
  if (!p) return null;
  return {
    ok: Boolean(p.ok),
    status: Number(p.status) || 0,
    ms: Number(p.ms) || 0,
    bytes: Number(p.bytes) || 0,
    error: clip(p.error, 120),
  };
}

function compactReport(report = {}) {
  const brief = (list) => (Array.isArray(list) ? list.slice(0, 3).map((x) => clip(typeof x === "string" ? x : JSON.stringify(x))) : []);
  const ex = report.export || null;
  return {
    ok: Boolean(report.ok),
    deep: Boolean(report.deep),
    ms: Number(report.ms) || 0,
    node: clip(report.node, 40),
    error: clip(report.error, 300),
    export: ex ? { ok: Boolean(ex.ok), pct: clip(ex.pct, 20), stage: clip(ex.stage, 120), ms: Number(ex.ms) || 0 } : null,
    /* حكم الصوت يُحفظ كما يُقاس: بدونه كان الفحص يقول «فاشل» ولا يقول إن
     * التلاوة نفسها لم تُحمَّل من الخادم. */
    audio_direct: probeBrief(report.audio_direct),
    audio_proxy: probeBrief(report.audio_proxy),
    page_errors: brief(report.page_errors),
    failed_requests: brief(report.failed_requests),
  };
}

async function recordSelfTest(report = {}) {
  try {
    await rest("/rest/v1/system_checks", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        kind: report.deep ? "render_selftest_deep" : "render_selftest",
        ok: Boolean(report.ok),
        detail: compactReport(report),
      }),
    });
    return true;
  } catch {
    return false;
  }
}

module.exports = { RECIPES, RECITERS, CONTENT_MODES, BACKGROUND_IDS, parseTemplate, chooseRecipe, generateAndPublish, runDailyAutopilots, catchUpDaily, backfillDaily, retryPublishFailed, dayHasPublish, missingDays, dayShift, cairoDate, renderSelfTest, recordSelfTest };
/* للاختبارات فقط — Vercel لا يستخدم هذه الخصائص */
module.exports.__test = { renderDeps, renderSelfTest, connectedPlatforms, hasPlatformConnection, waitForExport, acceptDialogs, assertExportStarted, LAUNCH_FLAGS, probeAudio, probeAudioViaProxy, audioUrlFor, recordSelfTest, compactReport, fetchAudio, installAudioRoute, AUDIO_HOSTS, runWithRetry, recordDaily, recordRenderFailure, createRun, preflightPage, closeStaleRuns, REQUIRED_PAGE_IDS, planTargets, connectionsFor, shouldCatchUp, catchUpDaily, backfillDaily, retryPublishFailed, dayHasPublish, missingDays, dayShift, collectDiag, exportError, probeAudioForRecipe, describeProbe, assertAudioPresent };

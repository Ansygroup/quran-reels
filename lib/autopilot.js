/* Server-side daily Quran reel generation and YouTube publishing. */
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const chromiumBin = require("@sparticuz/chromium").default;
const { chromium: playwright } = require("playwright-core");
const { q, q1, rest } = require("./db");
const { publishRow } = require("./publish");

const SITE = () => (process.env.SITE_ORIGIN || "https://quran-reels-tau.vercel.app").replace(/\/$/, "");
const START_RECIPES = [
  { file: "01-al-kawthar-short.mp4", s: 108, from: 1, to: 3, r: "Abdurrahmaan_As-Sudais_192kbps", reciter: "عبدالرحمن السديس", style: "card", title: "سورة الكوثر كاملة 🌙 الشيخ السديس | فيديو قرآن قصير #Shorts", desc: "سورة الكوثر — الآيات 1-3 بتلاوة الشيخ عبدالرحمن السديس، فيديو عمودي جاهز للمشاركة.\n\n📖 اقرأ الدليل: https://quran-reels-tau.vercel.app/articles/short-quran-verses-video/", tags: "سورة الكوثر,الكوثر,السديس,فيديو قرآن,قرآن شورتس,Quran,Shorts,quran reels" },
  { file: "02-al-asr-reflection.mp4", s: 103, from: 1, to: 3, r: "Alafasy_128kbps", reciter: "مشاري راشد العفاسي", style: "card", title: "سورة العصر — تذكير هادئ 🕊️ العفاسي #Shorts", desc: "سورة العصر (1-3) بتلاوة مشاري راشد العفاسي — تذكير قصير ليومك.\n\n📖 https://quran-reels-tau.vercel.app/ar/ayat-bil-mawdoo/", tags: "سورة العصر,العفاسي,تلاوة,فيديو قرآن,قرآن شورتس,Quran Reels" },
  { file: "03-al-ikhlas.mp4", s: 112, from: 1, to: 4, r: "Alafasy_128kbps", reciter: "مشاري راشد العفاسي", style: "card", title: "سورة الإخلاص 🤍 العفاسي — أربع آيات تُقرأ كل يوم #Shorts", desc: "سورة الإخلاص كاملة (112) بتلاوة العفاسي — أربع آيات تُردَّد كل يوم.\n\n📖 https://quran-reels-tau.vercel.app/articles/quran-khatma-plan/", tags: "سورة الإخلاص,الإخلاص,العفاسي,فيديو قرآن,أذكار,Quran" },
  { file: "04-ad-duha.mp4", s: 93, from: 1, to: 5, r: "Minshawy_Murattal_128kbps", reciter: "محمد صديق المنشاوي", style: "card", title: "سورة الضحى — طمأنينة القلب 🌅 المنشاوي #Shorts", desc: "سورة الضحى (1-5) بتلاوة الشيخ محمد صديق المنشاوي (مرتل).\n\n📖 https://quran-reels-tau.vercel.app/articles/khushoo-quran-video/", tags: "سورة الضحى,الضحى,المنشاوي,مرتل,فيديو قرآن,Quran Reels" },
  { file: "05-al-falaq.mp4", s: 113, from: 1, to: 5, r: "Husary_128kbps", reciter: "محمود خليل الحصري", style: "card", title: "سورة الفلق 🌑 الحصري — استعاذة صباحية #Shorts", desc: "سورة الفلق (113) بتلاوة الشيخ محمود خليل الحصري — رفيق الصباح.\n\n📖 https://quran-reels-tau.vercel.app/articles/adhkar-sabah-guide/", tags: "سورة الفلق,الفلق,الحصري,أذكار الصباح,فيديو قرآن,Quran" },
  { file: "06-an-nas-evening.mp4", s: 114, from: 1, to: 6, r: "Alafasy_128kbps", reciter: "مشاري راشد العفاسي", style: "card", title: "سورة الناس 🌙 العفاسي — ختمة المساء #Shorts", desc: "سورة الناس (114) كاملة بتلاوة مشاري راشد العفاسي.\n\n📖 https://quran-reels-tau.vercel.app/articles/everyday-adhkar-water-food/", tags: "سورة الناس,الناس,العفاسي,أذكار المساء,فيديو قرآن,Quran Reels" },
  { file: "07-al-mulk-opening.mp4", s: 67, from: 1, to: 2, r: "Abdul_Basit_Murattal_192kbps", reciter: "عبدالباسط عبدالصمد (مرتل)", style: "card", title: "مطلع سورة الملك — الآيتان الأوليان 👑 عبدالباسط #Shorts", desc: "مطلع سورة الملك (67:1-2) بتلاوة الشيخ عبدالباسط عبدالصمد (مرتل).\n\n📖 خطة ختمة كل ليلة: https://quran-reels-tau.vercel.app/articles/quran-khatma-plan/", tags: "سورة الملك,الملك,عبدالباسط,مرتل,فيديو قرآن,Quran Reels" },
  { file: "08-al-kawthar-word-highlight.mp4", s: 108, from: 1, to: 3, r: "MaherAlMuaiqly128kbps", reciter: "ماهر المعيقلي", style: "word", title: "الكوثر كلمة-بكلمة ✨ المعيقلي — تمييز متزامن #Shorts", desc: "سورة الكوثر بأسلوب كلمة-بكلمة: كل كلمة تُبرز مع التلاوة — بتلاوة الشيخ ماهر المعيقلي.\n\nجرّب الصانع: https://quran-reels-tau.vercel.app/ar/quran-word-highlight-video/", tags: "كلمة بكلمة,تمييز الكلمة,الكوثر,المعيقلي,فيديو قرآن,word by word quran" },
];
const RECIPES = START_RECIPES.concat(
  require("../scripts/video_recipes_c"),
  require("../scripts/video_recipes_d")
).map(r => ({ ...r, title: String(r.title || "").normalize("NFC"), desc: String(r.desc || "").normalize("NFC") }));
const FAMOUS_SURAHS = new Set([1, 2, 36, 55, 67, 93, 97, 103, 108, 112, 113, 114]);
const RECITERS = [...new Map(RECIPES.map(r => [r.r, { id: r.r, name: r.reciter }])).values()];
const CONTENT_MODES = new Set(["mix", "famous", "sequential"]);
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
async function renderRecipe(recipe, reciter, background, runIndex) {
  const browser = await playwright.launch({
    executablePath: await chromiumBin.executablePath(),
    args: [...chromiumBin.args, "--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
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
    await page.click("#btnPlay").catch(() => {});
    await page.waitForTimeout(1400);
    await page.click("#btnPlay").catch(() => {});
    await page.waitForTimeout(250);
    await page.locator("#btnCreate").scrollIntoViewIfNeeded();
    await page.click("#btnCreate", { timeout: 45000 });
    await page.waitForTimeout(900);
    await page.locator(".overlay [data-ok]").click({ timeout: 2500 }).catch(() => {});
    await page.waitForFunction(() => {
      const button = document.getElementById("btnDownload");
      const result = document.getElementById("expResult");
      return !!((button && button.offsetParent !== null) || (result && result.offsetParent !== null && result.textContent.trim().length > 4));
    }, null, { timeout: 210000 });
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

async function patchRun(id, values) {
  return rest(`/rest/v1/autopilot_runs?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ...values, updated_at: new Date().toISOString() }),
  });
}
async function getRunIndex(userId, runDate, runType) {
  if (runType === "daily") {
    const first = await rest(`/rest/v1/autopilot_runs?user_id=eq.${encodeURIComponent(userId)}&select=run_date&order=run_date.asc&limit=1`);
    if (Array.isArray(first) && first[0]?.run_date) {
      const days = (Date.parse(`${runDate}T00:00:00Z`) - Date.parse(`${first[0].run_date}T00:00:00Z`)) / 86400000;
      return Math.max(0, Math.floor(days));
    }
    return 0;
  }
  const rows = await rest(`/rest/v1/autopilot_runs?user_id=eq.${encodeURIComponent(userId)}&select=id&order=created_at.desc&limit=1000`);
  return Array.isArray(rows) ? rows.length - 1 : 0;
}
async function updateAutopilotHeartbeat(userId) {
  try { await q(`update autopilot set updated_at=now() where user_id=$1`, [userId]); } catch {}
}
async function createRun(userId, runType, runDate) {
  const runKey = runType === "daily" ? `daily:${userId}:${runDate}` : `manual:${userId}:${crypto.randomUUID()}`;
  const prior = await q1(`select * from autopilot_runs where run_key=$1 limit 1`, [runKey]);
  if (prior) return { existing: true, run: prior };
  const inserted = await rest("/rest/v1/autopilot_runs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ user_id: userId, run_key: runKey, run_type: runType, run_date: runDate, status: "rendering", started_at: new Date().toISOString() }),
  });
  return { existing: false, run: Array.isArray(inserted) ? inserted[0] : inserted };
}
async function getConfig(userId) {
  return q1(`select * from autopilot where user_id=$1 limit 1`, [userId]);
}
async function hasYouTubeConnection(userId) {
  return !!(await q1(`select id from social_connections where user_id=$1 and platform='youtube' limit 1`, [userId]));
}
function metadata(recipe, reciter) {
  const title = String(recipe.title || `سورة ${recipe.s} — الآيات ${recipe.from}-${recipe.to} #Shorts`).normalize("NFC").slice(0, 100);
  const caption = String(recipe.desc || `مقطع قرآني من السورة ${recipe.s}، الآيات ${recipe.from}-${recipe.to}، بتلاوة ${reciter.name}.\n\nhttps://quran-reels-tau.vercel.app/ar/quran-video-maker/`).normalize("NFC").slice(0, 4000);
  const hashtags = String(recipe.tags || "قرآن,تلاوة,Shorts").normalize("NFC").replace(/\s*,\s*/g, ",").slice(0, 500);
  return { title, caption, hashtags };
}

async function generateAndPublish(userId, { runType = "manual", config = null } = {}) {
  const row = config || await getConfig(userId);
  const template = parseTemplate(row?.template);
  const runDate = cairoDate();
  const { existing, run } = await createRun(userId, runType, runDate);
  if (existing) return { ok: run.status === "published", duplicate: true, run_id: run.id, status: run.status, url: run.external_url || null };

  let queueRow = null;
  try {
    if (!await hasYouTubeConnection(userId)) throw new Error("اربط قناة YouTube أولًا قبل تشغيل الإنشاء والنشر الآلي");
    const runIndex = await getRunIndex(userId, runDate, runType);
    const recipe = chooseRecipe(template, runIndex);
    const reciter = reciterFor(recipe, template, runIndex);
    const meta = metadata(recipe, reciter);
    await patchRun(run.id, { recipe_key: `${recipe.s}:${recipe.from}-${recipe.to}`, reciter: reciter.name, title: meta.title });
    const rendered = await renderRecipe(recipe, reciter, template.background, runIndex);
    const storagePath = `${userId}/autopilot/${runDate}-${run.id}.${rendered.mime === "video/webm" ? "webm" : "mp4"}`;
    const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
    await rest(`/storage/v1/object/reels/${encodedPath}`, {
      method: "POST",
      headers: { "Content-Type": rendered.mime, "x-upsert": "true" },
      body: rendered.buffer,
    });
    const inserted = await rest("/rest/v1/publish_queue", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: userId, platform: "youtube", video_path: storagePath, video_name: rendered.filename,
        title: meta.title, caption: meta.caption, hashtags: meta.hashtags,
        status: "scheduled", publish_at: new Date().toISOString(),
      }),
    });
    queueRow = Array.isArray(inserted) ? inserted[0] : inserted;
    await patchRun(run.id, { status: "queued", video_path: storagePath, publish_queue_id: queueRow?.id || null });
    const out = await publishRow(queueRow);
    if (!out.ok) throw new Error(out.error || "فشل نشر الفيديو على YouTube");
    await patchRun(run.id, { status: "published", external_url: out.url || null, completed_at: new Date().toISOString(), error: null });
    return { ok: true, run_id: run.id, url: out.url, title: meta.title, recipe: `${recipe.s}:${recipe.from}-${recipe.to}` };
  } catch (error) {
    await patchRun(run.id, { status: "failed", error: String(error?.message || error).slice(0, 500), completed_at: new Date().toISOString() }).catch(() => {});
    return { ok: false, run_id: run.id, error: String(error?.message || error).slice(0, 500) };
  } finally {
    if (runType === "daily") await updateAutopilotHeartbeat(userId);
  }
}

async function runDailyAutopilots() {
  const configs = await q(`select * from autopilot where enabled='true' order by updated_at asc limit 3`);
  const list = Array.isArray(configs) ? configs.filter(a => Array.isArray(a.platforms) && a.platforms.includes("youtube")) : [];
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

module.exports = { RECIPES, RECITERS, CONTENT_MODES, BACKGROUND_IDS, parseTemplate, chooseRecipe, generateAndPublish, runDailyAutopilots, cairoDate };

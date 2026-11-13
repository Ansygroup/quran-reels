#!/usr/bin/env node
/* ============================================================
 * اختبارات خادم لوحة الحساب (api/autopilot.js) + توحيد قوائم المنصات
 * ------------------------------------------------------------
 * يعمل بلا شبكة وبلا قاعدة بيانات: يستبدل lib/db ويعطّل اعتماديات chromium.
 * يغطي:
 *   1) قراءة تاريخ التشغيل عند غياب أعمدة المقالات (كانت تُفشل اللوحة كاملة).
 *   2) استجابة accountData (config/runs/connected/platforms/available/reciters).
 *   3) توليد المقال العشوائي عند غياب جدول articles (احتياطي من posts/).
 *   4) مطابقة قائمة المنصات بين lib/platforms و lib/publish و العميل.
 *
 * التشغيل: node tests/autopilot_api_test.js
 * ============================================================ */
const path = require("path");
const fs = require("fs");
const Module = require("module");

const ROOT = path.join(__dirname, "..");
let pass = 0;
const errs = [];
const ok = (m) => { pass++; console.log("OK   " + m); };
const fail = (m) => { errs.push(m); console.log("FAIL " + m); };
const chk = (name, cond, extra = "") => (cond ? ok(name) : fail(name + (extra ? " :: " + extra : "")));

/* ---------------- بدائل الاعتماديات الثقيلة (chromium) ---------------- */
const STUBS = {
  "@sparticuz/chromium": { default: { executablePath: async () => "/bin/true", args: [], headless: true } },
  "playwright-core": { chromium: { launch: async () => ({ newPage: async () => ({}), close: async () => {} }) } },
  playwright: {},
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(STUBS, request)) return STUBS[request];
  return origLoad.apply(this, arguments);
};

/* ---------------- بديل lib/db ----------------
 * الوحدة تلتقط الدوال عند التحميل (const { q1, rest } = require(…))، لذا نمرّر
 * الاستدعاءات إلى كائن تنفيذ قابل للتبديل بدل إعادة إسناد الخصائص لاحقًا. */
const dbPath = require.resolve(path.join(ROOT, "lib", "db.js"));
const impl = { q: async () => [], q1: async () => null, rest: async () => [] };
const dbStub = {
  q: (...a) => impl.q(...a),
  q1: (...a) => impl.q1(...a),
  rest: (...a) => impl.rest(...a),
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: dbStub };
const setDb = (o) => Object.assign(impl, o);

const api = require(path.join(ROOT, "api", "autopilot.js"));
const T = api.__test;
const libPlatforms = require(path.join(ROOT, "lib", "platforms.js"));

(async () => {
  chk("api/autopilot يصدّر __test للاختبارات", Boolean(T && T.accountData && T.loadRuns && T.articleRandom));

  /* 1) غياب أعمدة المقالات → نجاح بالقراءة الاحتياطية */
  const queries = [];
  setDb({
    rest: async (p) => {
      queries.push(p);
      if (/article_id/.test(p)) {
        throw new Error("Supabase REST 400 on /rest/v1/autopilot_runs: column autopilot_runs.article_id does not exist");
      }
      if (/autopilot_runs/.test(p)) return [{ id: "r1", status: "published", title: "سورة الكوثر" }];
      return [];
    },
  });
  let out = await T.loadRuns("u1");
  chk("غياب أعمدة المقالات لا يُسقط القراءة", out.rows.length === 1 && out.articlesColumns === false, JSON.stringify(out));
  chk("الاستعلام الاحتياطي لا يطلب أعمدة المقالات", Boolean(queries[1]) && !/article_id/.test(queries[1]), queries[1] || "لا استعلام ثانٍ");

  /* 2) نجاح كامل → الأعمدة موجودة */
  queries.length = 0;
  setDb({ rest: async (p) => { queries.push(p); return [{ id: "r1", article_id: "a1", article_title: "مقال" }]; } });
  out = await T.loadRuns("u1");
  chk("قراءة كاملة عند وجود الأعمدة", out.articlesColumns === true && out.rows.length === 1, JSON.stringify(out));

  /* 3) فشل كل الاستعلامات → مصفوفة فارغة بلا استثناء */
  setDb({ rest: async () => { throw new Error("boom"); } });
  let threw = false;
  try { out = await T.loadRuns("u1"); } catch { threw = true; }
  chk("فشل كل القراءات يعطي قائمة فارغة بلا استثناء", !threw && Array.isArray(out.rows) && out.rows.length === 0);

  /* 4) accountData: العقد الكامل */
  setDb({
    q1: async () => null,
    rest: async (p) => {
      if (/social_connections/.test(p)) return [{ id: "c1", platform: "youtube", account_name: "قناة قرآن" }];
      if (/autopilot_runs/.test(p)) return [{ id: "r1", status: "published", title: "سورة" }];
      return [];
    },
  });
  const data = await T.accountData("u1");
  const keys = ["config", "runs", "connected", "platforms", "channel", "reciters", "available"];
  chk("accountData يعيد كل مفاتيح العقد", keys.every((k) => k in data), Object.keys(data).join(","));
  chk("config افتراضي عند عدم وجود صف", Boolean(data.config) && data.config.enabled === false, JSON.stringify(data.config));
  chk("connected/platforms من social_connections", data.connected === true && data.platforms.includes("youtube"), JSON.stringify(data.platforms));
  chk("available = 8 منصات (5 قابلة للنشر)",
    Array.isArray(data.available) && data.available.length === 8 && data.available.filter((p) => p.publish).length === 5,
    JSON.stringify(data.available.map((p) => p.key + ":" + p.publish)));
  chk("channel يحتوي اسم القناة", /يوتيوب/.test(data.channel) && /قناة قرآن/.test(data.channel), data.channel);

  /* 5) المقال العشوائي: احتياطي من المستودع عند غياب الجدول */
  setDb({ rest: async () => { throw new Error("Supabase REST 404 on /rest/v1/articles: relation does not exist"); } });
  const art = await T.articleRandom();
  chk("article_random يعمل بلا جدول articles", Boolean(art && art.id && art.title && art.url), JSON.stringify(art));
  const local = T.repoArticles();
  chk("مكتبة المقالات المضمّنة غير فارغة", local.length >= 500, String(local.length));
  chk("مفاتيح المقال فريدة في المكتبة", new Set(local.map((a) => a.id)).size === local.length,
    String(local.length - new Set(local.map((a) => a.id)).size) + " مكرّر");

  setDb({ rest: async () => [{ id: "db-1", title: "من القاعدة" }] });
  const art2 = await T.articleRandom();
  chk("يفضّل جدول articles عندما يوجد", Boolean(art2) && art2.id === "db-1", JSON.stringify(art2));

  /* 6) مطابقة المنصات: lib/platforms ↔ lib/publish dispatch */
  const publishSrc = fs.readFileSync(path.join(ROOT, "lib", "publish.js"), "utf8");
  const dispatchable = [...publishSrc.matchAll(/case "([a-z]+)":/g)].map((m) => m[1]);
  const missing = libPlatforms.PUBLISHABLE.filter((p) => !dispatchable.includes(p));
  const extra = dispatchable.filter((p) => !libPlatforms.PUBLISHABLE.includes(p));
  chk("كل منصة publish:true لها حالة نشر في lib/publish", missing.length === 0, missing.join(","));
  chk("لا منصة تُنشر بلا إعلانها في lib/platforms", extra.length === 0, extra.join(","));

  /* 7) مطابقة أسماء المنصات في العميل مع المصدر الواحد */
  const clientSrc = fs.readFileSync(path.join(ROOT, "public", "js", "publish.js"), "utf8");
  const block = (clientSrc.match(/const PLATFORMS = \{([\s\S]*?)\n\};/) || [, ""])[1];
  const clientMap = Object.fromEntries([...block.matchAll(/(\w+):\s*"([^"]*)"/g)].map((m) => [m[1], m[2]]));
  const mismatched = Object.entries(libPlatforms.NAMES).filter(([k, v]) => clientMap[k] !== v);
  chk("أسماء المنصات في العميل = lib/platforms (المصدر الواحد)", mismatched.length === 0,
    mismatched.map(([k, v]) => `${k}: "${clientMap[k]}" ≠ "${v}"`).join(" · "));

  /* 8) lib/autopilot يفلتر غير القابل للنشر ولا يكرّر الخريطة */
  const autoSrc = fs.readFileSync(path.join(ROOT, "lib", "autopilot.js"), "utf8");
  chk("lib/autopilot يتحقق من المنصات بدل إسقاط غير المدعوم", /validatePlatforms\(requested\)/.test(autoSrc));
  chk("لا خريطة منصات مكرّرة في lib/autopilot", !/linkedin:\s*"لينكد إن"/.test(autoSrc),
    "ما زالت الخريطة القديمة موجودة");

  /* 9) الحماية من أعمدة ناقصة في createRun/patchRun */
  chk("createRun/patchRun يحاولان مجددًا بلا أعمدة المقالات",
    /hasArticleCols/.test(autoSrc) && /stripArticleCols/.test(autoSrc));

  /* 10) لا اعتماد على chromium/playwright عند الإقلاع (عطل إنتاج 2026-11-07)
   * كان require للحزمة في أعلى lib/autopilot يجعل كل دالة تستوردها تنهار قبل
   * معالجة الطلب: /api/autopilot و/api/cron/publish → 500 FUNCTION_INVOCATION_FAILED
   * والبناء «success». نُعيد تمثيل العطل: كل require للحزمتين يفشل، ويجب أن
   * تُحمَّل الوحدة رغم ذلك (لأن التحميل صار بـawait import داخل renderRecipe). */
  const { execFileSync } = require("child_process");
  const libPath = JSON.stringify(path.join(ROOT, "lib", "autopilot.js"));
  const childScript = `
    const Module = require("module");
    const orig = Module._load;
    Module._load = function (req) {
      if (/^(@sparticuz\\/chromium|playwright(-core)?)$/.test(req)) throw new Error("simulated missing: " + req);
      return orig.apply(this, arguments);
    };
    try { require(${libPath}); console.log("LOADED"); }
    catch (e) { console.log("THREW " + String(e.message).slice(0, 100)); }
  `;
  let childOut = "";
  try {
    childOut = execFileSync(process.execPath, ["-e", childScript], { encoding: "utf8", timeout: 60000 }).trim();
  } catch (e) {
    childOut = "EXEC_FAILED " + String(e.message).slice(0, 100);
  }
  chk("lib/autopilot يُحمَّل بلا chromium/playwright (لا انهيار إقلاع)", childOut === "LOADED", childOut);

  const libAuto = require(path.join(ROOT, "lib", "autopilot.js"));
  const libSrc = fs.readFileSync(path.join(ROOT, "lib", "autopilot.js"), "utf8");
  chk("الحزم الثقيلة تُحمَّل بـawait import داخل renderRecipe",
    /await import\("@sparticuz\/chromium"\)/.test(libSrc) && /await import\("playwright-core"\)/.test(libSrc));
  chk("لا require للحزم الثقيلة في أعلى lib/autopilot",
    !/^const chromiumBin = require/m.test(libSrc) && !/require\("playwright-core"\)/.test(libSrc));

  let friendly = true, why = "";
  try {
    await libAuto.__test.renderDeps();
  } catch (e) {
    friendly = e && e.code === "RENDER_DEPS_UNAVAILABLE" && /محرّك المتصفح/.test(String(e.message));
    why = String(e && e.message).slice(0, 120);
  }
  chk("تعذّر تحميل محرّك المتصفح يعطي خطأ مفهومًا لا انهيارًا", friendly, why);

  /* 11) لا مهام نشر لمنصة غير مرتبطة (16 صفًا فاشلًا في الإنتاج) */
  const libAuto2 = require(path.join(ROOT, "lib", "autopilot.js"));
  setDb({ rest: async (p) => (/social_connections/.test(p) ? [{ platform: "youtube" }] : []) });
  const set1 = await libAuto2.__test.connectedPlatforms("u1");
  chk("connectedPlatforms يعيد المنصات المرتبطة فقط", set1 instanceof Set && set1.has("youtube") && !set1.has("tiktok"),
    [...(set1 || [])].join(","));
  const autoSrc2 = fs.readFileSync(path.join(ROOT, "lib", "autopilot.js"), "utf8");
  chk("generateAndPublish يوقف عند منصة مختارة غير مرتبطة", /requested\.filter\(p => !connectedSet\.has\(p\)\)/.test(autoSrc2) && /if \(missing\.length\)/.test(autoSrc2));
  const apiSrc2 = fs.readFileSync(path.join(ROOT, "api", "autopilot.js"), "utf8");
  chk("run_all يستخدم مسار التشغيل نفسه دون إسقاط المنصات", /body\.action === "run" \|\| body\.action === "run_all"/.test(apiSrc2) && !/platforms = requested\.filter\(p => connectedPlatforms\.includes\(p\)\)/.test(apiSrc2));

  /* 12) فحص محرّك التوليد متاح ويعيد تقريرًا منظّمًا */
  let st = null, stErr = null;
  try { st = await libAuto2.__test.renderSelfTest(); } catch (e) { stErr = e; }
  chk("renderSelfTest يُرجع تقريرًا بلا استثناء", Boolean(st) && typeof st.ok === "boolean" && typeof st.node === "string" && typeof st.ms === "number",
    stErr ? String(stErr.message).slice(0, 80) : JSON.stringify(st).slice(0, 120));
  chk("renderSelfTest يحمل مسار التنفيذ أو رسالة خطأ", Boolean(st && (st.executable_path || st.error)));

  /* 13) عطل in.('…') — كان يجعل كل تشغيل يفشل بـ«اربط القنوات أولًا» رغم الربط */
  const libSrc3 = fs.readFileSync(path.join(ROOT, "lib", "autopilot.js"), "utf8");
  const apiSrc3 = fs.readFileSync(path.join(ROOT, "api", "autopilot.js"), "utf8");
  chk("لا فلترة in. باقتباس مفرد (لا تطابق أي صف في PostgREST)",
    !/=in\.\('/.test(libSrc3) && !/=in\.\('/.test(apiSrc3),
    "ما زال هناك in.('…') في lib/autopilot.js أو api/autopilot.js");

  setDb({ rest: async (p) => (/social_connections/.test(p) ? [{ platform: "youtube" }] : []) });
  const hasConn = await libAuto2.__test.hasPlatformConnection("u1", ["youtube"]);
  chk("hasPlatformConnection يعيد true لقناة مرتبطة (كانت false دائمًا)", hasConn === true, String(hasConn));
  const hasNo = await libAuto2.__test.hasPlatformConnection("u1", ["tiktok"]);
  chk("hasPlatformConnection يعيد false لمنصة غير مرتبطة", hasNo === false, String(hasNo));
  setDb({ rest: async () => { throw new Error("down"); } });
  const hasDown = await libAuto2.__test.hasPlatformConnection("u1", ["youtube"]);
  chk("hasPlatformConnection لا يرمي عند فشل القاعدة", hasDown === false, String(hasDown));

  /* 14) جهوزية مزوّدي الربط — لا زر «اربط» بلا مفاتيح (META_APP_ID غائبة في Vercel) */
  const savedEnv = { ...process.env };
  delete process.env.META_APP_ID; delete process.env.META_APP_SECRET;
  delete process.env.TIKTOK_CLIENT_KEY; delete process.env.TIKTOK_CLIENT_SECRET;
  delete process.env.X_CLIENT_ID; delete process.env.X_CLIENT_SECRET;
  delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_SECRET;
  let rd = T.providerReady();
  chk("providerReady: كل المزوّدين false بلا مفاتيح", Object.values(rd).every(v => v === false), JSON.stringify(rd));
  process.env.GOOGLE_CLIENT_ID = "gid"; process.env.GOOGLE_CLIENT_SECRET = "gsec";
  rd = T.providerReady();
  chk("providerReady: يوتيوب true عند وجود مفاتيح جوجل", rd.youtube === true, JSON.stringify(rd));
  chk("providerReady: فيسبوك/إنستغرام يتبعان مفاتيح META", rd.facebook === false && rd.instagram === false);
  chk("CONNECT_PROVIDER يحوّل instagram/facebook إلى meta",
    T.CONNECT_PROVIDER.instagram === "meta" && T.CONNECT_PROVIDER.facebook === "meta");
  for (const k of Object.keys(savedEnv)) if (savedEnv[k] !== undefined) process.env[k] = savedEnv[k];

  /* accountData يحمل ready/connect لكل منصة (الواجهة تعتمد عليها) */
  setDb({ rest: async () => [], q: async () => [], q1: async () => null });
  const acc = await T.accountData("u1").catch(() => null);
  if (acc) {
    chk("accountData.available تحمل ready وconnect", Array.isArray(acc.available) && acc.available.every(p => typeof p.ready === "boolean" && "connect" in p),
      JSON.stringify((acc.available || []).slice(0, 2)));
  } else {
    ok("accountData غير متاح في بيئة الاختبار (تُخطّى)");
  }

  /* 15) انتظار التصدير التشخيصي — بدل مهلة صامتة (توقّف 210s في الإنتاج) */
  const w4 = libAuto2.__test.waitForExport;
  chk("waitForExport مُصدَّرة للاختبار", typeof w4 === "function");
  const fakePage = (states, opts = {}) => {
    let i = 0;
    return {
      waitTimeout: 0,
      evaluate: async () => states[Math.min(i++, states.length - 1)],
      waitForTimeout: async (ms) => { this && 0; },
    };
  };
  // نجاح: تصبح النتيجة جاهزة بعد مرحلتين
  const okStates = [
    { pct: "0%", stage: "جارٍ تحضير التلاوة…", running: true, result: false },
    { pct: "45%", stage: "جارٍ إنشاء الفيديو… 0:12 / 0:28", running: true, result: false },
    { pct: "100%", stage: "", running: false, result: true, meta: "quran-reels.webm · 3.2 م.ب" },
  ];
  const okPage = { evaluate: async () => okStates[Math.min(okPage._i++, okStates.length - 1)], waitForTimeout: async () => {} , _i: 0 };
  let okRes = null, okErr = null;
  try { okRes = await w4(okPage, 30000, 10000); } catch (e) { okErr = e; }
  chk("waitForExport ينجح عند ظهور النتيجة", Boolean(okRes && okRes.result), okErr && String(okErr.message).slice(0, 80));

  // فشل: الحالة ثابتة عند 0% → رسالة تشخيصية تحمل المرحلة والنسبة
  const stuckPage = { evaluate: async () => ({ pct: "0%", stage: "جارٍ تحضير التلاوة…", running: true, result: false }), waitForTimeout: async () => {} };
  let stuckErr = null;
  try { await w4(stuckPage, 60000, 50); } catch (e) { stuckErr = e; }
  chk("waitForExport يرمي عند التوقّف بدل التعليق", Boolean(stuckErr));
  chk("رسالة التوقّف تحمل المرحلة والنسبة",
    Boolean(stuckErr && /تحضير التلاوة/.test(stuckErr.message) && /0%/.test(stuckErr.message)),
    stuckErr && stuckErr.message.slice(0, 120));

  // فشل: انتهاء المهلة الكلية مع تقدّم بطيء
  const slowStates = [{ pct: "1%", stage: "جارٍ إنشاء الفيديو…", running: true, result: false }];
  let slowPageI = 0;
  const slowPage = { evaluate: async () => slowStates[0], waitForTimeout: async () => {} };
  let slowErr = null;
  try { await w4(slowPage, 40, 100000); } catch (e) { slowErr = e; }
  chk("انتهاء المهلة الكلية يذكر الزمن", Boolean(slowErr && /لم يكتمل خلال/.test(slowErr.message)), slowErr && slowErr.message.slice(0, 90));

  chk("أعلام منع تقييد الخلفية موجودة في الإطلاق",
    Array.isArray(libAuto2.__test.LAUNCH_FLAGS) && libAuto2.__test.LAUNCH_FLAGS.includes("--disable-renderer-backgrounding") && libAuto2.__test.LAUNCH_FLAGS.includes("--disable-background-timer-throttling"),
    JSON.stringify(libAuto2.__test.LAUNCH_FLAGS || []));

  /* 16) الفحص العميق: توليد فيديو تجريبي بلا رفع أو نشر */
  const libDeep = fs.readFileSync(path.join(ROOT, "lib", "autopilot.js"), "utf8");
  const apiDeep = fs.readFileSync(path.join(ROOT, "api", "autopilot.js"), "utf8");
  const pubDeep = fs.readFileSync(path.join(ROOT, "public", "js", "publish.js"), "utf8");
  chk("renderSelfTest يقبل deep", /async function renderSelfTest\(\{ deep = false \} = \{\}\)/.test(libDeep));
  chk("الفحص العميق يستخدم waitForExport", /if \(deep\)\s*\{/.test(libDeep) && /waitForExport\(page, 150000/.test(libDeep));
  chk("الفحص العميق لا يرفع ولا ينشر", !/storage\/v1\/object[^\n]*selftest/.test(libDeep) && !/publishRow\([^)]*\)[^\n]*deep/.test(libDeep));
  chk("الـAPI يمرّر body.deep", /renderSelfTest\(\{ deep: body\.deep === true \}\)/.test(apiDeep));
  chk("الواجهة ترسل deep", /action: "selftest_render", deep/.test(pubDeep));
  chk("زر اختبار التوليد موجود في الواجهة", /quickRenderTest/.test(pubDeep));
  let deepReport = null;
  try { deepReport = await T.renderSelfTest({ deep: true }); } catch (e) { deepReport = { error: String(e.message) }; }
  chk("renderSelfTest({deep:true}) يعيد تقريرًا يحمل العلم", Boolean(deepReport) && deepReport.deep === true && typeof deepReport.ok === "boolean",
    JSON.stringify(deepReport).slice(0, 120));

  /* 17) فحص التلاوة: مباشر وعبر الوسيط (فرضية تعليق «تحضير التلاوة») */
  const realFetch = global.fetch;
  const libSrc4 = fs.readFileSync(path.join(ROOT, "lib", "autopilot.js"), "utf8");
  chk("renderSelfTest يفحص التلاوة مباشرة وعبر /api/proxy",
    /report\.audio_direct = await probeAudio\(\)/.test(libSrc4) && /report\.audio_proxy = await probeAudioViaProxy\(\)/.test(libSrc4));
  chk("يسجّل أخطاء الصفحة والطلبات الفاشلة",
    /requestfailed/.test(libSrc4) && /report\.failed_requests/.test(libSrc4));
  chk("audioUrlFor يبني صيغة everyayah الصحيحة",
    libAuto2.__test.audioUrlFor("Alafasy_128kbps", 108, 1) === "https://everyayah.com/data/Alafasy_128kbps/108001.mp3",
    libAuto2.__test.audioUrlFor("Alafasy_128kbps", 108, 1));

  global.fetch = async () => ({ ok: true, status: 206, headers: { get: () => "audio/mpeg" }, arrayBuffer: async () => new ArrayBuffer(2048), text: async () => "" });
  const pa = await libAuto2.__test.probeAudio();
  chk("probeAudio يعيد ok/status/bytes", pa.ok === true && pa.status === 206 && pa.bytes === 2048, JSON.stringify(pa));
  const pv = await libAuto2.__test.probeAudioViaProxy();
  chk("probeAudioViaProxy يقرأ عبر /api/proxy", pv.ok === true && /\/api\/proxy\?u=/.test(libSrc4), JSON.stringify(pv));
  global.fetch = async () => { throw new Error("ECONNREFUSED"); };
  const paErr = await libAuto2.__test.probeAudio();
  chk("probeAudio لا يرمي عند فشل الشبكة", paErr.ok === false && /ECONNREFUSED/.test(paErr.error || ""), JSON.stringify(paErr));
  global.fetch = realFetch;

  /* 18) لماذا لم يبدأ التصدير؟ + حوارات متأخرة (تشغيل 2026-11-11 14:22) */
  const libSrc5 = fs.readFileSync(path.join(ROOT, "lib", "autopilot.js"), "utf8");
  chk("renderRecipe يستخدم acceptDialogs بدل نقرة واحدة",
    /await acceptDialogs\(page, 20000\)/.test(libSrc5) && !/waitForTimeout\(900\);\s*\n\s*await page\.locator\("\.overlay/.test(libSrc5));
  chk("waitForExport يقرأ exporting/dialog/toast/count", /exporting: Boolean\(typeof Creator/.test(libSrc5) && /dialog: Boolean\(document\.querySelector\("\.overlay \[data-ok\]"\)\)/.test(libSrc5) && /toast:/.test(libSrc5));
  chk("assertExportStarted مُصدَّرة", typeof libAuto2.__test.assertExportStarted === "function");

  // رفض صريح برسالة توست
  const pToast = { evaluate: async () => ({ exporting: false, running: false, toast: "اختر الآيات أولًا", count: 3 }) };
  let eToast = null; try { await libAuto2.__test.assertExportStarted(pToast); } catch (e) { eToast = e; }
  chk("يشرح رفض المولّد بنص التوست", Boolean(eToast && /اختر الآيات أولًا/.test(eToast.message)), eToast && eToast.message.slice(0, 80));

  // اختيار فارغ
  const pEmpty = { evaluate: async () => ({ exporting: false, running: false, toast: "", count: 0 }) };
  let eEmpty = null; try { await libAuto2.__test.assertExportStarted(pEmpty); } catch (e) { eEmpty = e; }
  chk("يشرح اختيار الآيات الفارغ", Boolean(eEmpty && /count=0/.test(eEmpty.message)), eEmpty && eEmpty.message.slice(0, 80));

  // بدأ فعلًا → لا يرمي
  let startedErr = null;
  try { await libAuto2.__test.assertExportStarted({ evaluate: async () => ({ exporting: true, running: true, toast: "", count: 3 }) }); } catch (e) { startedErr = e; }
  chk("لا يرمي حين يبدأ التصدير فعلًا", startedErr === null, startedErr && startedErr.message);

  // حوار متأخر: acceptDialogs يضغطه حين يظهر في المحاولة الثالثة
  let calls = 0;
  const pDialog = { evaluate: async () => { calls++; return calls >= 3; }, waitForTimeout: async () => {} };
  const clicked = await libAuto2.__test.acceptDialogs(pDialog, 8000);
  chk("acceptDialogs يلتقط الحوار المتأخر", clicked === true && calls >= 3, `clicked=${clicked} calls=${calls}`);

  /* 19) سبب الرفض من الصفحة نفسها + تقييد المدة قبل الإنشاء */
  const libSrcG42 = fs.readFileSync(path.join(ROOT, "lib", "autopilot.js"), "utf8");
  const creatorSrc = fs.readFileSync(path.join(ROOT, "public", "js", "creator.js"), "utf8");
  chk("Wait/تعريف: Creator.lastAbortReason يُسجَّل قبل كل خروج مبكر",
    /lastAbortReason/.test(creatorSrc) && (creatorSrc.match(/lastAbortReason = "/g) || []).length >= 4,
    String((creatorSrc.match(/lastAbortReason = "/g) || []).length) + " موضعًا");
  chk("assertExportStarted يقرأ lastAbortReason", /st\.abort/.test(libSrcG42) && /المولّد لم يبدأ التصدير/.test(libSrcG42));
  chk("renderRecipe يقيّد المدة قبل الإنشاء (لا حوار «المدة طويلة»)",
    /totalDuration\(\)/.test(libSrcG42) && /<= 240/.test(libSrcG42));

  const pAbort = { evaluate: async () => ({ exporting: false, running: false, toast: "", count: 2, abort: "تعذّر تحضير التلاوة (تعذّر تحميل الصوت)" }) };
  let eAbort = null; try { await libAuto2.__test.assertExportStarted(pAbort); } catch (e) { eAbort = e; }
  chk("رسالة الخطأ تحمل سبب الصفحة بالحرف", Boolean(eAbort && /تعذّر تحميل الصوت/.test(eAbort.message)), eAbort && eAbort.message.slice(0, 90));

  /* 20) حفظ نتيجة الفحص في system_checks (بدل أن تعيش في المتصفح فقط) */
  const calls20 = [];
  setDb({ rest: async (p, opts) => { calls20.push({ p, opts }); return []; } });
  const rec1 = await libAuto2.__test.recordSelfTest({ ok: true, deep: true, node: "v24", export: { ok: true, pct: "100%" } });
  chk("recordSelfTest يكتب صفًا واحدًا", rec1 === true && calls20.length === 1, JSON.stringify(calls20.map((c) => c.p)));
  chk("المسار /rest/v1/system_checks بطريقة POST",
    calls20[0] && calls20[0].p === "/rest/v1/system_checks" && calls20[0].opts.method === "POST");
  const body20 = calls20[0] && JSON.parse(calls20[0].opts.body || "{}");
  chk("النوع render_selftest_deep والحالة ok", body20 && body20.kind === "render_selftest_deep" && body20.ok === true, body20 && body20.kind);
  chk("التفاصيل مختصرة (نصوص ≤ 300 حرف)", Boolean(body20 && body20.detail && body20.detail.node === "v24" && body20.detail.export.ok === true));
  const longReport = libAuto2.__test.compactReport({ ok: false, error: "x".repeat(900), page_errors: ["a", "b", "c", "d"], failed_requests: Array.from({ length: 9 }, () => "y".repeat(500)) });
  chk("compactReport يقتطع الأخطاء والطلبات إلى 3 ونصوص ≤ 300",
    longReport.error.length <= 300 && longReport.page_errors.length === 3 && longReport.failed_requests.length === 3 && longReport.failed_requests[0].length <= 300);
  setDb({ rest: async () => { throw new Error("db down"); } });
  const rec2 = await libAuto2.__test.recordSelfTest({ ok: false, deep: false });
  chk("فشل التسجيل لا يرمي (best effort)", rec2 === false);
  const apiSrc6 = fs.readFileSync(path.join(ROOT, "api", "autopilot.js"), "utf8");
  chk("الـAPI يعيد recorded مع التقرير", /recorded = await recordSelfTest\(report, uid\)/.test(apiSrc6) && /recorded }/.test(apiSrc6));
  chk("ملف ترحيل الجدول موجود ومحميّ", fs.existsSync(path.join(ROOT, "sql", "migrations", "20261111_system_checks.sql")) &&
    /enable row level security/.test(fs.readFileSync(path.join(ROOT, "sql", "migrations", "20261111_system_checks.sql"), "utf8")));

  /* 21) آخر فحص محفوظ يظهر في لوحة الحساب */
  setDb({
    q1: async () => null,
    rest: async (p) => {
      if (/system_checks/.test(p)) return [{ kind: "render_selftest_deep", ok: true, detail: { ms: 9000, user_id: "u9" }, created_at: "2026-11-11T15:20:00Z" }];
      if (/autopilot_runs/.test(p)) return [];
      if (/social_connections/.test(p)) return [];
      return [];
    },
  });
  const acct = await T.accountData("u9");
  chk("accountData يحمل last_check", Boolean(acct.last_check && acct.last_check.kind === "render_selftest_deep"), JSON.stringify(acct.last_check));
  chk("lastSelfTest يقرأ أحدث صف بترتيب تنازلي",
    (await T.lastSelfTest("u9")) !== null);
  setDb({ rest: async () => { throw new Error("table missing"); } });
  chk("غياب الجدول لا يُسقط اللوحة (last_check = null)", (await T.lastSelfTest("u9")) === null);
  let checkQuery = "";
  setDb({ rest: async (p) => { checkQuery = p; return [{ kind: "render_failure", detail: { user_id: "other", error: "private" } }]; } });
  chk("آخر فحص لا يكشف تفاصيل مستخدم آخر", (await T.lastSelfTest("u9")) === null && /detail->>user_id=eq.u9/.test(checkQuery) && /kind=in.\(render_selftest,render_selftest_deep\)/.test(checkQuery));
  const scoped = [];
  setDb({ rest: async (p, opts) => { scoped.push({ p, opts }); return []; } });
  await libAuto2.__test.recordSelfTest({ ok: true }, "u9");
  chk("فحص المستخدم محفوظ بمعرّفه", JSON.parse(scoped[0].opts.body).detail.user_id === "u9");
  const pubSrc = fs.readFileSync(path.join(ROOT, "public", "js", "publish.js"), "utf8");
  chk("اللوحة تعرض «آخر فحص محفوظ»", /acctLastCheck/.test(pubSrc) && /آخر \$\{kind\} محفوظ/.test(pubSrc));
  chk("نص الفحص يذكر هل حُفظت النتيجة", /data\.recorded \?/.test(pubSrc));
  /* 22) آخر تشغيل آلي يصل للوحة (لا فشل صامت) */
  setDb({
    q1: async () => null,
    rest: async (p2) => {
      if (/autopilot_runs/.test(p2)) return [{ run_date: "2026-11-11", status: "failed", error: "توقّف عند «تحضير التلاوة»", external_url: null, created_at: "2026-11-11T04:30:00Z" }];
      return [];
    },
  });
  const ld = await T.lastDaily("u9");
  chk("lastDaily يقرأ آخر تشغيل آلي", ld && ld.status === "failed" && ld.run_date === "2026-11-11", JSON.stringify(ld));
  chk("lastDaily يستخدم run_type=daily فقط", /run_type=eq\.daily/.test(fs.readFileSync(path.join(ROOT, "api", "autopilot.js"), "utf8")));
  setDb({ rest: async (p2) => (/autopilot_runs/.test(p2) ? [{ run_date: "2026-11-11", status: "published", external_url: "https://youtu.be/x", created_at: "2026-11-11T04:30:00Z" }] : []) });
  const acct2 = await T.accountData("u9");
  chk("accountData يحمل last_daily للوحة", Boolean(acct2.last_daily && acct2.last_daily.status === "published"), JSON.stringify(acct2.last_daily));
  setDb({ rest: async () => { throw new Error("db down"); } });
  chk("تعذّر قراءة التشغيل لا يُسقط اللوحة", (await T.lastDaily("u9")) === null);
  const pubSrc2 = fs.readFileSync(path.join(ROOT, "public", "js", "publish.js"), "utf8");
  chk("اللوحة ترسم سطر آخر تشغيل آلي وتهرّب النص",
    /acctLastDaily/.test(pubSrc2) && /(?:lastDailyLine|dailyLine)\(data\.last_daily\)/.test(pubSrc2) && /&quot;/.test(pubSrc2));

  chk("publish.js مكسور الكاش في index.html", /publish\.js\?v=35/.test(fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8")));

  /* 19) G42: التلاوة أولًا — فحص مبكر بدل تعليق ٢١٠ ثانية، وتشخيص صوت
   * (تشغيل 2026-11-11 14:22 كان pct="" stage="" running=false: الصفحة كانت
   *  تحضّر الصوت ٨٥ ثانية لكل آية قبل أن تُظهر نافذة التصدير أصلًا). */
  const libSrcAudio = fs.readFileSync(path.join(ROOT, "lib", "autopilot.js"), "utf8");
  chk("renderRecipe يفحص التلاوة قبل الرندر ويفشل بسبب مسمّى",
    /probeAudioForRecipe\(recipe, reciter\)/.test(libSrcAudio) && /التلاوة غير متاحة من الخادم:/.test(libSrcAudio) && /diag\.audio = audioProbe/.test(libSrcAudio));
  chk("مساعدات الصوت مُصدَّرة للاختبار",
    typeof libAuto2.__test.probeAudioForRecipe === "function" && typeof libAuto2.__test.describeProbe === "function");

  const g42FetchBackup = global.fetch;
  global.fetch = async () => ({ ok: false, status: 503, headers: { get: () => "" }, arrayBuffer: async () => new ArrayBuffer(0), text: async () => "down" });
  const probeDown = await libAuto2.__test.probeAudioForRecipe({ s: 108, from: 1, to: 1 }, { id: "Alafasy_128kbps" });
  chk("فحص الصوت يفشل بوضوح عند تعذّر المصدر",
    probeDown.direct.ok === false && probeDown.proxy.ok === false && probeDown.direct.status === 503,
    JSON.stringify(probeDown.direct));
  global.fetch = async () => ({ ok: true, status: 206, headers: { get: () => "audio/mpeg" }, arrayBuffer: async () => new ArrayBuffer(2048), text: async () => "" });
  const probeUp = await libAuto2.__test.probeAudioForRecipe({ s: 108, from: 1, to: 2 }, { id: "Alafasy_128kbps" });
  chk("فحص الصوت ينجح ويقيس أول وآخر آية",
    probeUp.direct.ok === true && probeUp.proxy.ok === true && Boolean(probeUp.direct_last && probeUp.direct_last.ok),
    JSON.stringify({ direct: probeUp.direct.ok, last: probeUp.direct_last && probeUp.direct_last.ok }));
  chk("describeProbe يشرح النتيجة بجملة",
    /^ok 206 2048B/.test(libAuto2.__test.describeProbe(probeUp.direct)) &&
    /HTTP 503/.test(libAuto2.__test.describeProbe(probeDown.direct)));

  /* اعتراض الصوت: فشل الجلب ⇒ 502 فورًا (لا انتظار /api/proxy 60s) */
  let audioRouteHandler = null;
  const audioFakePage = { route: async (matcher, handler) => { audioRouteHandler = handler; return true; } };
  const stats = await libAuto2.__test.installAudioRoute(audioFakePage);
  chk("installAudioRoute يعيد عدّادات", Boolean(stats && stats.ok === 0 && stats.miss === 0), JSON.stringify(stats));
  global.fetch = async () => { throw new Error("ENOTFOUND everyayah.com"); };
  let fulfilled = null;
  await audioRouteHandler({
    request: () => ({ url: () => "https://quran-reels.test/proxy?u=" + encodeURIComponent("https://everyayah.com/data/Alafasy_128kbps/108001.mp3") }),
    fulfill: async (o) => { fulfilled = o; },
    continue: async () => { fulfilled = { continued: true }; },
    abort: async () => { fulfilled = { aborted: true }; },
  });
  chk("فشل الصوت ⇒ ردّ 502 فوري مع عدّاد",
    fulfilled && fulfilled.status === 502 && stats.miss === 1 && Boolean(stats.lastMiss),
    JSON.stringify({ status: fulfilled && fulfilled.status, miss: stats.miss, lastMiss: stats.lastMiss }));
  let passed = null;
  await audioRouteHandler({
    request: () => ({ url: () => "https://quran-reels.test/proxy?u=" + encodeURIComponent("https://example.com/x.png") }),
    fulfill: async (o) => { passed = o; },
    continue: async () => { passed = { continued: true }; },
  });
  chk("مضيف غير صوتي يمرّ كما هو (لا وسيط مفتوح)", Boolean(passed && passed.continued), JSON.stringify(passed));
  global.fetch = g42FetchBackup;

  /* تشخيص الصوت داخل لقطة التعليق */
  const errAudio = libAuto2.__test.exportError("stall", { pct: "0%", stage: "", exporting: false, count: 2, prepared: false, cache: 0, overlay: false, silent: false, prepErr: "timeout" }, 90000);
  chk("سبب التعليق يذكر التحضير والكاش والنافذة",
    /prepared=false/.test(errAudio.message) && /cache=0/.test(errAudio.message) && /overlay=false/.test(errAudio.message) && /silent=false/.test(errAudio.message),
    errAudio.message.slice(0, 140));
  chk("compactReport يحفظ حكم صوت التلاوة",
    (() => { const r = libAuto2.__test.compactReport({ ok: false, audio_direct: { ok: false, status: 0, ms: 7, error: "ENOTFOUND" }, audio_proxy: { ok: true, status: 200, ms: 9, bytes: 2048 } });
      return r.audio_direct && r.audio_direct.ok === false && r.audio_proxy && r.audio_proxy.ok === true; })());

  /* الصفحة: نافذة التصدير تظهر قبل التحضير + جلب صوت بمهلة */
  const g42CreatorSrc = fs.readFileSync(path.join(ROOT, "public", "js", "creator.js"), "utf8");
  const g42ReelSrc = fs.readFileSync(path.join(ROOT, "public", "js", "reel.js"), "utf8");
  chk("startExport يُظهر النافذة قبل تحضير التلاوة",
    g42CreatorSrc.indexOf('ov.hidden = false;') > 0 &&
    g42CreatorSrc.indexOf('ov.hidden = false;') < g42CreatorSrc.indexOf('if (!this.prepared && !AyahPlayer.playing)'),
    "ترتيب النافذة/التحضير");
  chk("تحضير التلاوة مسقوف بمهلة (لا تعليق أبدًا)",
    /_fetchAudio\(url, ms = 20000\)/.test(g42ReelSrc) && /deadline = Date\.now\(\) \+ 45000/.test(g42ReelSrc) && /AbortController/.test(g42ReelSrc));
  chk("نسخ الأصول مرفوعة (reel v5 / creator v9 / publish v35 / sw qr-v47)",
    /reel\.js\?v=5/.test(fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8")) &&
    /creator\.js\?v=9/.test(fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8")) &&
    /qr-v47/.test(fs.readFileSync(path.join(ROOT, "public", "sw.js"), "utf8")));

  /* 20) G43: لا نشر بلا صوت + حلقة التشغيل الصامت لا تموت بعد أول آية */
  chk("assertAudioPresent مُصدَّرة", typeof libAuto2.__test.assertAudioPresent === "function");
  let eSilent = null;
  try { await libAuto2.__test.assertAudioPresent({ evaluate: async () => ({ silent: true, cache: 0, prepErr: "HTTP 502" }) }); } catch (e) { eSilent = e; }
  chk("يرفض الفيديو الصامت بسبب مسمّى",
    Boolean(eSilent) && /لن يُنشر فيديو بلا صوت/.test(eSilent.message) && /HTTP 502/.test(eSilent.message),
    eSilent && eSilent.message.slice(0, 90));
  const aOk = await libAuto2.__test.assertAudioPresent({ evaluate: async () => ({ silent: false, cache: 3, prepErr: "" }) });
  chk("يمرّ حين تكون التلاوة محمَّلة", aOk && aOk.silent === false && aOk.cache === 3, JSON.stringify(aOk));
  chk("الفحص يقع قبل أي تنزيل أو رفع",
    libSrcAudio.indexOf("await assertAudioPresent(page)") > 0 &&
    libSrcAudio.indexOf("await assertAudioPresent(page)") < libSrcAudio.indexOf('page.click("#btnDownload")'));

  const reelLoop = fs.readFileSync(path.join(ROOT, "public", "js", "reel.js"), "utf8");
  chk("الحلقة الصامتة تُعيد جدولة نفسها بعد تقدّم الآية",
    /this\._advance\(\);\s*\n\s*if \(this\.playing\) this\._raf = requestAnimationFrame\(step\);/.test(reelLoop));

  /* assertExportStarted: ينتظر بدء التصدير بدل الحكم من قراءة واحدة، ويتجاهل تنبيهًا قديمًا */
  let g43Calls = 0;
  const pSlow = { evaluate: async () => (++g43Calls < 2 ? { exporting: false, running: false, toast: "تم إنشاء الفيديو بنجاح ✨", count: 3 } : { exporting: true, running: true, toast: "", count: 3 }), waitForTimeout: async () => {} };
  let eSlow = null;
  try { await libAuto2.__test.assertExportStarted(pSlow, { tries: 4, gapMs: 1 }); } catch (e) { eSlow = e; }
  chk("لا يحكم بالرفض قبل بدء التصدير فعلًا", eSlow === null, eSlow && eSlow.message.slice(0, 80));

  const pStale = { evaluate: async () => ({ exporting: false, running: false, toast: "تم إنشاء الفيديو بنجاح ✨", count: 3 }), waitForTimeout: async () => {} };
  let eStale = null;
  try { await libAuto2.__test.assertExportStarted(pStale, { tries: 2, gapMs: 1 }); } catch (e) { eStale = e; }
  chk("تنبيه نجاح قديم لا يُقرأ كرفض", eStale === null, eStale && eStale.message.slice(0, 80));

  /* 21) محاكي المتصفح الحقيقي: الوضع الصامت يرفض النشر (SILENT=1) */
  const dailySim = fs.readFileSync(path.join(ROOT, "tools", "e2e_daily.js"), "utf8");
  chk("المحاكي يدعم SILENT=1 لاختبار الحارس",
    /const SILENT = process\.env\.SILENT === "1"/.test(dailySim) && /رفض النشر بلا صوت/.test(dailySim));

  /* 23) G44: ربط منتهٍ (invalid_grant) — علامة على القناة + تنبيه في اللوحة.
   * الواقع 2026-11-12 04:30: الرندر نجح والفيديو جاهز في التخزين، وفشل النشر
   * بـ«تجديد التوكن فشل (youtube): invalid_grant» — رسالة لا تقول ما يُفعل. */
  const pubLib = require(path.join(ROOT, "lib", "publish.js"));
  chk("isReauthError يميّز انتهاء الربط عن الأعطال العابرة",
    pubLib.__test.isReauthError("invalid_grant") === true &&
    pubLib.__test.isReauthError("", "Token has been expired or revoked.") === true &&
    pubLib.__test.isReauthError("429") === false);
  const pubSrc3 = fs.readFileSync(path.join(ROOT, "lib", "publish.js"), "utf8");
  chk("فشل التجديد الدائم يسجّل reauth_needed ويشرح الخطوة",
    /markReauth\(conn,/.test(pubSrc3) && /انتهت صلاحية ربط/.test(pubSrc3) &&
    /insert into system_checks \(kind, ok, detail\) values \('reauth_needed'/.test(pubSrc3) &&
    !/needs_reauth/.test(pubSrc3));

  setDb({
    q1: async () => null,
    rest: async (p2) => {
      if (/social_connections/.test(p2)) return [{ id: "c1", platform: "youtube", account_name: "قناتي", updated_at: "2026-11-12T04:00:00Z" }];
      if (/system_checks/.test(p2)) return [{ detail: { connection_id: "c1", platform: "youtube", reason: "invalid_grant" }, created_at: "2026-11-12T04:32:00Z" }];
      return [];
    },
  });
  const acctRe = await T.accountData("u9");
  chk("accountData يبلّغ عن منصة من system_checks(reauth_needed)",
    Array.isArray(acctRe.reauth) && acctRe.reauth.includes("youtube"), JSON.stringify(acctRe.reauth));

  setDb({ q1: async () => null, rest: async (p2) => {
    if (/social_connections/.test(p2)) return [{ id: "mine", platform: "youtube", updated_at: "2026-11-12T05:00:00Z" }];
    if (/system_checks/.test(p2)) return [{ detail: { connection_id: "other", platform: "youtube" }, created_at: "2026-11-12T06:00:00Z" }];
    return [];
  }});
  chk("علامة حساب آخر لا تظهر في لوحتي", !(await T.accountData("u9")).reauth.includes("youtube"));
  setDb({ rest: async (p2) => {
    if (/social_connections/.test(p2)) return [{ id: "mine", platform: "youtube", updated_at: "2026-11-12T05:00:00Z" }];
    if (/system_checks/.test(p2)) return [{ detail: { connection_id: "mine", platform: "youtube" }, created_at: "2026-11-12T04:00:00Z" }];
    if (/publish_queue/.test(p2)) return [{ platform: "youtube", error: "invalid_grant", updated_at: "2026-11-12T04:00:00Z" }];
    return [];
  }});
  chk("التحذير القديم يختفي بعد إعادة ربط ناجحة", !(await T.accountData("u9")).reauth.includes("youtube"));

  setDb({
    q1: async () => null,
    rest: async (p2) => {
      if (/social_connections/.test(p2)) return [{ id: "c1", platform: "youtube", account_name: "Psych", meta: null }];
      if (/publish_queue/.test(p2)) return [{ platform: "youtube", error: "تجديد التوكن فشل (youtube): invalid_grant" }];
      return [];
    },
  });
  const acctRe2 = await T.accountData("u9");
  chk("accountData يستنتج إعادة الربط من آخر خطأ نشر",
    Array.isArray(acctRe2.reauth) && acctRe2.reauth.includes("youtube"), JSON.stringify(acctRe2.reauth));

  setDb({
    q1: async () => null,
    rest: async (p2) => {
      if (/social_connections/.test(p2)) return [{ id: "c1", platform: "youtube", account_name: "Psych", meta: {} }];
      if (/publish_queue/.test(p2)) return [{ platform: "youtube", error: "جوجل رفض الرفع: quota" }];
      return [];
    },
  });
  const acctRe3 = await T.accountData("u9");
  chk("خطأ عابر (quota) لا يُعلَن كإعادة ربط",
    Array.isArray(acctRe3.reauth) && acctRe3.reauth.length === 0, JSON.stringify(acctRe3.reauth));

  const pubSrc4 = fs.readFileSync(path.join(ROOT, "public", "js", "publish.js"), "utf8");
  chk("اللوحة تشرح المحاولة التلقائية بعد إعادة الربط",
    /acctReauth/.test(pubSrc4) && /هيحاول ينشر الفيديو الجاهز بعد الربط/.test(pubSrc4) && /lastReauthLine/.test(pubSrc4));
  chk("اللوحة فيها زر «انشر الفيديو الجاهز» بإجراء retry_publish",
    /btnRetryPublish/.test(pubSrc4) && /retry_publish/.test(pubSrc4) && /retry_publish/.test(fs.readFileSync(path.join(ROOT, "api", "autopilot.js"), "utf8")));

  console.log(errs.length ? `ERRORS ${errs.length}` : `ALL OK (${pass} checks)`);
  if (errs.length) console.log(errs.map((e) => " - " + e).join("\n"));
  process.exit(errs.length ? 1 : 0);
})().catch((e) => {
  console.log("FAIL استثناء غير متوقع: " + (e && e.message));
  process.exit(1);
});

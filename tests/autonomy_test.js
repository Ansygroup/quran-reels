#!/usr/bin/env node
/* ============================================================
 * الاختبار الآلي الذاتي (G28)
 * ------------------------------------------------------------
 * غرضه: أن يعمل النشر اليومي بلا تدخّل بشري.
 *   1) الصوت: الصفحة تطلبه عبر /proxy (وسيط كان يُرجع 500 لملفات
 *      mp3)، فنعترضه ونخدمه من fetch الخادم + كاش، مع قصر
 *      المضيفين المسموحين (لا وسيط مفتوح).
 *   2) إعادة محاولة واحدة تلقائيًا عند فشل عارض ضمن ميزانية زمنية.
 *   3) تسجيل نتيجة كل تشغيل في system_checks (نوع autopilot_daily).
 *
 * التشغيل: node tests/autonomy_test.js
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

/* بدائل الاعتماديات الثقيلة + قاعدة البيانات (كما في بقية الحزم) */
const STUBS = {
  "@sparticuz/chromium": { default: { executablePath: async () => "/bin/true", args: [], headless: true } },
  "playwright-core": { chromium: { launch: async () => ({ newPage: async () => ({}), close: async () => {} }) } },
  playwright: {},
};
const origLoad = Module._load;
Module._load = function (request) {
  if (Object.prototype.hasOwnProperty.call(STUBS, request)) return STUBS[request];
  return origLoad.apply(this, arguments);
};
const pubPath = require.resolve(path.join(ROOT, "lib", "publish.js"));
const pub = { calls: [], results: [], impl: async (row) => ({ ok: true, url: "https://youtu.be/r-" + row.id }) };
require.cache[pubPath] = {
  id: pubPath, filename: pubPath, loaded: true,
  exports: {
    publishRow: async (row, platform) => { pub.calls.push({ id: row.id, platform: platform || row.platform }); return pub.impl(row, platform); },
    videoUrl: () => "", pickConnection: () => null, __test: { pickConnection: () => null },
  },
};
const dbPath = require.resolve(path.join(ROOT, "lib", "db.js"));
const dbCalls = [];
const impl = {
  q: async () => [],
  q1: async () => null,
  rest: async (p, opts) => { dbCalls.push({ p, opts }); return []; },
};
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { q: (...a) => impl.q(...a), q1: (...a) => impl.q1(...a), rest: (...a) => impl.rest(...a) },
};
process.env.SITE_ORIGIN = process.env.SITE_ORIGIN || "https://example.test";

const A = require(path.join(ROOT, "lib", "autopilot.js"));
const T = A.__test;

const mkRoute = (url) => {
  const state = { url, fulfilled: null, continued: false };
  return {
    state,
    request: () => ({ url: () => url }),
    fulfill: async (o) => { state.fulfilled = o; },
    continue: async () => { state.continued = true; },
  };
};

(async () => {
  /* 1) fetchAudio: قصر المضيفين + الكاش */
  chk("AUDIO_HOSTS لا يفتح الوسيط لكل الإنترنت", T.AUDIO_HOSTS instanceof Set && T.AUDIO_HOSTS.size <= 4 && T.AUDIO_HOSTS.has("everyayah.com") && !T.AUDIO_HOSTS.has("example.com"));
  chk("يرفض مضيفًا غير مسموح", (await T.fetchAudio("https://evil.example/x.mp3", new Map())) === null);
  chk("يرفض رابطًا غير صالح", (await T.fetchAudio("not a url", new Map())) === null && (await T.fetchAudio("", new Map())) === null);

  const realFetch = global.fetch;
  let fetches = 0;
  global.fetch = async () => { fetches++; return { ok: true, headers: { get: () => "audio/mpeg" }, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer }; };
  const cache = new Map();
  const got1 = await T.fetchAudio("https://everyayah.com/data/x/001001.mp3", cache);
  await T.fetchAudio("https://everyayah.com/data/x/001001.mp3", cache);
  chk("يعيد الجسم والنوع", Boolean(got1) && got1.type === "audio/mpeg" && got1.body.length === 4);
  chk("الكاش يمنع إعادة التنزيل", fetches === 1, "fetches=" + fetches);
  global.fetch = async () => ({ ok: false, status: 500, headers: { get: () => "" }, arrayBuffer: async () => new ArrayBuffer(0) });
  chk("فشل المصدر ⇒ null (لا استثناء)", (await T.fetchAudio("https://qurango.net/a.mp3", new Map())) === null);
  global.fetch = async () => ({ ok: true, headers: { get: () => "audio/mpeg" }, arrayBuffer: async () => new ArrayBuffer(20 * 1024 * 1024) });
  chk("ملف ضخم يُرفض", (await T.fetchAudio("https://everyayah.com/big.mp3", new Map())) === null);
  global.fetch = realFetch;

  /* 2) installAudioRoute: يعترض الصوت فقط ويخدمه من الخادم */
  global.fetch = async () => ({ ok: true, headers: { get: () => "audio/mpeg" }, arrayBuffer: async () => new Uint8Array([9, 9, 9]).buffer });
  const routes = [];
  const fakePage = { route: async (matcher, handler) => { routes.push({ matcher, handler }); } };
  const installed = await T.installAudioRoute(fakePage);
  chk("يُثبّت مسارًا واحدًا ويعيد عدّادات الصوت", Boolean(installed && installed.ok === 0 && installed.miss === 0) && routes.length === 1);
  const m = routes[0].matcher;
  chk("يطابق /proxy?u=", m("https://quran-reels-tau.vercel.app/proxy?u=https%3A%2F%2Feveryayah.com%2Fa.mp3") === true);
  chk("يطابق /api/proxy?u=", m("https://quran-reels-tau.vercel.app/api/proxy?u=https%3A%2F%2Feveryayah.com%2Fa.mp3") === true);
  chk("لا يطابق طلبًا عاديًا", m("https://quran-reels-tau.vercel.app/js/core.js") === false && m("https://quran-reels-tau.vercel.app/proxy") === false);

  const r1 = mkRoute("https://quran-reels-tau.vercel.app/proxy?u=" + encodeURIComponent("https://everyayah.com/data/x/002255.mp3"));
  await routes[0].handler(r1);
  chk("يخدم الصوت من الخادم (fulfill 200)", r1.state.fulfilled && r1.state.fulfilled.status === 200 && r1.state.continued === false);
  chk("الترويسات تسمح للصفحة بقراءة الصوت",
    r1.state.fulfilled.headers["access-control-allow-origin"] === "*" && r1.state.fulfilled.headers["content-type"] === "audio/mpeg");

  const r2 = mkRoute("https://quran-reels-tau.vercel.app/proxy?u=" + encodeURIComponent("https://evil.example/a.mp3"));
  await routes[0].handler(r2);
  chk("مضيف غير مسموح يمرّ للوسيط الأصلي", r2.state.fulfilled === null && r2.state.continued === true);
  global.fetch = realFetch;

  chk("renderRecipe يثبّت المسار قبل التوجيه للصفحة",
    /await installAudioRoute\(page\);\s*\n[\s\S]{0,1400}?await page\.goto/.test(fs.readFileSync(path.join(ROOT, "lib", "autopilot.js"), "utf8")));

  /* 3) إعادة المحاولة التلقائية */
  let n = 0;
  const flaky = async () => (++n === 1 ? { ok: false, error: "تعذّر تحضير التلاوة" } : { ok: true, url: "https://youtu.be/x" });
  const r = await T.runWithRetry(flaky, { budgetMs: 150000 });
  chk("فشل عارض ⇒ محاولة ثانية تنجح", r.result.ok === true && r.attempts === 2 && n === 2);
  let k = 0;
  const always = async () => ({ ok: false, error: "x" + ++k });
  const r2b = await T.runWithRetry(always, { budgetMs: 150000 });
  chk("فشل متكرر ⇒ محاولتان فقط", r2b.attempts === 2 && r2b.result.ok === false && k === 2);
  let c = 0;
  const okFirst = async () => { c++; return { ok: true }; };
  chk("النجاح من أول مرة لا يعيد المحاولة", (await T.runWithRetry(okFirst)).attempts === 1 && c === 1);
  let t = 0;
  const slowFail = async () => { t++; return { ok: false, error: "بطيء" }; };
  const clockValues = [0, 999999];
  let ci = 0;
  const rBudget = await T.runWithRetry(slowFail, { budgetMs: 1000, clock: () => clockValues[Math.min(ci++, clockValues.length - 1)] });
  chk("تجاوز الميزانية ⇒ لا محاولة ثانية (حد ٣٠٠ ثانية)", rBudget.attempts === 1 && t === 1);
  const thrown = async () => { throw new Error("انفجار"); };
  const rThrow = await T.runWithRetry(thrown, { budgetMs: 0 });
  chk("الاستثناء يُلتقط كنتيجة فشل", rThrow.result.ok === false && /انفجار/.test(rThrow.result.error));

  /* 4) تسجيل نتيجة التشغيل اليومي */
  dbCalls.length = 0;
  const recOk = await T.recordDaily("user-1", { ok: true, run_id: "r1", url: "https://youtu.be/x" }, 2);
  const body = dbCalls[0] && JSON.parse(dbCalls[0].opts.body || "{}");
  chk("يكتب في system_checks نوع autopilot_daily", recOk === true && body && body.kind === "autopilot_daily" && body.ok === true);
  chk("يحفظ عدد المحاولات والسبب", body && body.detail.attempts === 2 && body.detail.url.includes("youtu.be"));
  impl.rest = async () => { throw new Error("db down"); };
  chk("فشل التسجيل لا يُفشل التشغيل", (await T.recordDaily("user-1", { ok: false, error: "x" }, 2)) === false);

  /* 5) الربط في التشغيل اليومي */
  const src = fs.readFileSync(path.join(ROOT, "lib", "autopilot.js"), "utf8");
  chk("runDailyAutopilots يستخدم الإعادة والتسجيل", /runWithRetry\(\(n\) => generateAndPublish/.test(src) && src.includes("recordDaily(config.user_id"));
  chk("النتيجة تُرجع attempts/recorded", /attempts, recorded/.test(src));

  /* 6) فحص النسخة المنشورة قبل التوليد (درس النافذة المفقودة) */
  const goodHtml = '<div id="exportOverlay" hidden></div><div id="expPct"></div><div id="expStage"></div><div id="expRunning"></div><div id="expResult"></div><button id="btnCancelExport"></button><script src="js/creator.js?v=5"></script><script src="js/quran.js?v=4"></script>';
  global.fetch = async () => ({ ok: true, status: 200, text: async () => goodHtml });
  const pre1 = await T.preflightPage();
  chk("نسخة سليمة ⇒ preflight ناجح", pre1.ok === true && pre1.missing.length === 0);
  chk("preflight يقرأ إصدارات السكربتات", pre1.versions && pre1.versions.creator === 5 && pre1.versions.quran === 4, JSON.stringify(pre1.versions));

  global.fetch = async () => ({ ok: true, status: 200, text: async () => '<div id="exportOverlay"></div>' });
  const pre2 = await T.preflightPage();
  chk("نسخة ناقصة ⇒ preflight فاشل بأسماء العناصر",
    pre2.ok === false && pre2.missing.includes("expPct") && /نسخة الإنتاج تفتقد/.test(pre2.error), pre2.error);

  global.fetch = async () => ({ ok: false, status: 503, text: async () => "" });
  const pre3 = await T.preflightPage();
  chk("صفحة لا تستجيب ⇒ فشل واضح لا استثناء", pre3.ok === false && /503/.test(String(pre3.error)));

  global.fetch = async () => { throw new Error("network down"); };
  const pre4 = await T.preflightPage();
  chk("انقطاع الشبكة ⇒ فشل مُلتقط", pre4.ok === false && /network down/.test(String(pre4.error)));
  const realFetch2 = require("util").types ? global.fetch : global.fetch;

  /* 7) تنظيف التشغيلات العالقة */
  dbCalls.length = 0;
  impl.rest = async () => [];
  impl.q = async (sql, params) => { dbCalls.push({ sql, params }); return []; };
  const closed = await T.closeStaleRuns(45);
  chk("ينظّف autopilot_runs العالقة", closed === true && dbCalls.some((c) => /status='rendering'/.test(c.sql) && /completed_at=now\(\)/.test(c.sql)));
  const staleCall = dbCalls.find((c) => /status='rendering'/.test(c.sql)) || { params: [] };
  const windowMin = (staleCall.params[1] ? Date.now() - Date.parse(staleCall.params[1]) : 0) / 60000;
  /* طبقة db تُترجم إلى PostgREST ولا تفهم `now() - ($2 || ' minutes')::interval`،
   * فكان الشرط الزمني يسقط ⇒ كل تشغيل 'rendering' يُغلق مهما كان عمره. */
  chk("لا يمسّ التشغيلات الحديثة (نافذة زمنية فعلية)", /created_at < \$2/.test(staleCall.sql || "") && Math.abs(windowMin - 45) < 1,
    JSON.stringify({ window: windowMin, sql: String(staleCall.sql || "").slice(0, 90) }));

  /* 8) الترتيب في التشغيل اليومي: تنظيف ← فحص ← توليد */
  const src2 = fs.readFileSync(path.join(ROOT, "lib", "autopilot.js"), "utf8");
  chk("التشغيل اليومي يفحص النسخة قبل التوليد", /await closeStaleRuns\(\)/.test(src2) && /const pre = await preflightPage\(\)/.test(src2));
  chk("فشل الفحص ⇒ لا توليد + تسجيل السبب", /if \(!pre\.ok\)/.test(src2) && /فحص النسخة المنشورة فشل/.test(src2));
  chk("الفحص اليدوي يحمل نتيجة preflight", /report\.preflight = preflight/.test(src2));

  /* 9) شبكة الأمان: هل يحتاج اليوم تشغيلًا بديلًا؟ */
  chk("منشور اليوم ⇒ لا إنقاذ", T.shouldCatchUp([{ status: "published" }]) === "published");
  chk("قيد الإنشاء ⇒ لا نُزاحم", T.shouldCatchUp([{ status: "rendering" }]) === "running");
  chk("فاشل فقط ⇒ إنقاذ", T.shouldCatchUp([{ status: "failed" }]) === "go");
  chk("لا تشغيل اليوم ⇒ إنقاذ", T.shouldCatchUp([]) === "go" && T.shouldCatchUp(null) === "go");
  chk("مزيج فاشل + منشور ⇒ لا إنقاذ (نجح اليوم)", T.shouldCatchUp([{ status: "failed" }, { status: "published" }]) === "published");

  const src3 = fs.readFileSync(path.join(ROOT, "lib", "autopilot.js"), "utf8");
  chk("الإنقاذ يستخدم مفتاح تشغيل منفصل (‎:retry1)", /runKeySuffix: "retry1"/.test(src3) && /keySuffix \? `\$\{base\}:\$\{keySuffix\}` : base/.test(src3));
  chk("الإنقاذ يفحص النسخة قبل التوليد", /const verdict = shouldCatchUp\(rows\)/.test(src3) && /const pre = await preflightPage\(\)/.test(src3));

  const cron = fs.readFileSync(path.join(ROOT, "api", "cron", "monitor.js"), "utf8");
  chk("كرون المراقبة يشغّل الإنقاذ يوميًا", /catchUpDaily\(\)/.test(cron) && /rescue/.test(cron));
  chk("فحص الموقع الكامل يبقى الاثنين أو بـ?full=1", /getUTCDay\(\) === 1/.test(cron) && /full=1/.test(cron));
  const vj = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
  const mono = (vj.crons || []).find((c) => c.path === "/api/cron/monitor");
  chk("جدولة المراقبة صارت يومية 10:15 UTC", mono && mono.schedule === "15 10 * * *", JSON.stringify(mono));
  /* المفتاح يجب أن يكون نسبيًا: "/api/..." يُسقط البناء بـ[invalid_function_source] */
  const monFn = (vj.functions || {})["api/cron/monitor.js"];
  chk("ميزانية المراقبة 300 ثانية (تتسع لتوليد فيديو)", monFn && monFn.maxDuration === 300, JSON.stringify(monFn));
  chk("مفتاح monitor في functions نسبي ونفس حزمة chromium",
    !Object.keys(vj.functions || {}).some((k) => k.startsWith("/")) &&
    monFn && /@sparticuz\/chromium/.test(String(monFn.includeFiles || "")));

  /* 10) catchUpDaily: لا يولّد شيئًا إن كان اليوم منشورًا أو قيد الإنشاء */
  impl.q = async (sql) => (/from autopilot where enabled/i.test(String(sql)) ? [{ user_id: "u1", enabled: true, platforms: ["youtube"] }] : []);
  impl.rest = async (p2) => (/autopilot_runs/.test(String(p2)) ? [{ id: "r1", status: "published" }] : []);
  const cap1 = await T.catchUpDaily();
  chk("منشور اليوم ⇒ يُتخطى بلا توليد", cap1.length === 1 && cap1[0].skipped === "published", JSON.stringify(cap1));
  impl.rest = async (p2) => (/autopilot_runs/.test(String(p2)) ? [{ id: "r2", status: "rendering" }] : []);
  const cap2 = await T.catchUpDaily();
  chk("قيد الإنشاء ⇒ يُتخطى (لا نُزاحم التشغيل الجاري)", cap2.length === 1 && cap2[0].skipped === "running", JSON.stringify(cap2));
  impl.q = async () => [];
  chk("بلا إعدادات مُفعّلة ⇒ لا شيء", (await T.catchUpDaily()).length === 0);

  /* 11) تشخيص الفشل: سبب مقروء + لقطة كاملة محفوظة (لا JSON مقطوع) */
  const lastState = { pct: "", stage: "", exporting: false, running: false, count: 0, dialog: false, toast: "حدّد آية", abort: "لا شيء محدد", result: false };
  const errStall = T.exportError("stall", lastState, 90000);
  chk("رسالة التوقف تحمل الحقول المفيدة بدل JSON مقطوع",
    /exporting=false/.test(errStall.message) && /count=0/.test(errStall.message) &&
    /toast=حدّد آية/.test(errStall.message) && /abort=لا شيء محدد/.test(errStall.message) &&
    !/\{"pct"/.test(errStall.message), errStall.message);
  chk("الخطأ يحمل diag.kind وdiag.last", errStall.diag && errStall.diag.kind === "stall" && errStall.diag.last.pct === "");
  chk("رسالة التوقف لا تتجاوز 600 حرف", errStall.message.length <= 600);

  const diagNoPage = await T.collectDiag(null, { errors: ["console: boom"], failed: ["x.js — net::ERR"], steps: ["click-create"] });
  chk("collectDiag بلا صفحة يحفظ الأخطاء والخطوات", diagNoPage.errors[0] === "console: boom" && diagNoPage.failed.length === 1 && diagNoPage.steps[0] === "click-create");

  const fakeDiagPage = {
    evaluate: async () => ({
      url: "https://example.test/?s=108",
      present: { expPct: { exists: true, visible: false, text: "" } },
      exporting: false,
      abort: "",
      count: 0,
      toast: "",
      dialog: false,
      audio: [{ src: "https://everyayah.com/x.mp3", readyState: 0, paused: true, error: null }],
      audioCtx: "suspended",
      sw: "none",
      scripts: ["js/creator.js?v=5"],
    }),
  };
  const diagSnap = await T.collectDiag(fakeDiagPage, { errors: [], failed: [], steps: ["warm-audio"] });
  chk("collectDiag يقرأ العناصر والصوت والسياق من الصفحة",
    diagSnap.page && diagSnap.page.present.expPct.exists === true && diagSnap.page.audioCtx === "suspended" &&
    diagSnap.page.audio.length === 1 && diagSnap.page.scripts[0].includes("creator.js"), JSON.stringify(diagSnap.page));
  const diagBroken = await T.collectDiag({ evaluate: async () => { throw new Error("page closed"); } }, {});
  chk("صفحة مغلقة لا تُسقط التشخيص", diagBroken.page && /page closed/.test(diagBroken.page.error));

  dbCalls.length = 0;
  impl.rest = async (p2, opts) => { dbCalls.push({ p: p2, opts }); return []; };
  /* كما في renderRecipe: دمج لقطة الصفحة على خطأ التوقف قبل الحفظ */
  errStall.diag = Object.assign({}, errStall.diag, diagSnap);
  const rfOk = await T.recordRenderFailure("u1", { id: "run-9", run_key: "daily:u1:2026-11-12" }, errStall, errStall.message);
  const rfBody = dbCalls[0] && JSON.parse(dbCalls[0].opts.body || "{}");
  chk("الفشل يُحفظ في system_checks نوع render_failure",
    rfOk === true && rfBody.kind === "render_failure" && rfBody.ok === false &&
    rfBody.detail.run_key === "daily:u1:2026-11-12" && rfBody.detail.diag.kind === "stall", JSON.stringify(rfBody).slice(0, 300));
  chk("التشخيص المحفوظ يحمل line/errors/steps كاملة", rfBody.detail.diag.last && Array.isArray(rfBody.detail.diag.errors) && Array.isArray(rfBody.detail.diag.steps));
  impl.rest = async () => { throw new Error("db down"); };
  chk("تعذّر حفظ التشخيص لا يُفشل التشغيل", (await T.recordRenderFailure("u1", { id: "x" }, errStall, "e")) === false);
  impl.rest = async (p2, opts) => { dbCalls.push({ p: p2, opts }); return []; };

  const autoSrc = fs.readFileSync(path.join(ROOT, "lib", "autopilot.js"), "utf8");
  chk("renderRecipe يلتقط pageerror/console/requestfailed", /page\.on\("pageerror"/.test(autoSrc) && /page\.on\("console"/.test(autoSrc) && /page\.on\("requestfailed"/.test(autoSrc));
  chk("فشل التوليد يُسجَّل مع التشخيص", /recordRenderFailure\(userId, run, error, message\)/.test(autoSrc));

  /* 12) الإعادة التلقائية كانت بلا فعل: المحاولة الثانية تصطدم بصفّها الفاشل */
  dbCalls.length = 0;
  impl.rest = async (p2, opts) => { dbCalls.push({ p: p2, opts }); return []; };
  impl.q1 = async () => ({ id: "r-old", run_key: "daily:u1:2026-11-12", status: "failed", external_url: null, publish_queue_id: null });
  const cr1 = await T.createRun("u1", "daily", "2026-11-12", null, "", true);
  const patchCall = dbCalls.find((c) => /autopilot_runs\?id=eq\.r-old/.test(String(c.p)) && c.opts && c.opts.method === "PATCH");
  const patchBody = patchCall ? JSON.parse(patchCall.opts.body) : {};
  chk("المحاولة الثانية تستكمل الصفّ الفاشل بدل duplicate",
    cr1.existing === false && cr1.resumed === true && cr1.run.status === "rendering", JSON.stringify(cr1).slice(0, 200));
  chk("الاستكمال يعيد الصفّ إلى rendering ويمسح الخطأ",
    patchBody.status === "rendering" && patchBody.error === null, JSON.stringify(patchBody));

  const cr2 = await T.createRun("u1", "daily", "2026-11-12", null, "", false);
  chk("بلا استكمال يبقى السلوك القديم (duplicate)", cr2.existing === true && cr2.run.status === "failed");
  impl.q1 = async () => ({ id: "r-pub", status: "failed", external_url: "https://youtu.be/abc", publish_queue_id: null });
  chk("فشل بعد نشر جزئي لا يُستكمل (لا منشور مكرّر)", (await T.createRun("u1", "daily", "2026-11-12", null, "", true)).existing === true);
  impl.q1 = async () => ({ id: "r-done", status: "published" });
  chk("المنشور لا يُستكمل أبدًا", (await T.createRun("u1", "daily", "2026-11-12", null, "", true)).existing === true);
  impl.q1 = async () => null;

  const seenAttempts = [];
  const rSeen = await T.runWithRetry(async (n) => { seenAttempts.push(n); return { ok: false, error: "x" }; }, { budgetMs: 600000, clock: () => Date.now() });
  chk("runWithRetry يمرّر رقم المحاولة (1 ثم 2)", rSeen.attempts === 2 && seenAttempts.join(",") === "1,2", seenAttempts.join(","));

  const retrySrc = fs.readFileSync(path.join(ROOT, "lib", "autopilot.js"), "utf8");
  chk("التشغيل اليومي والإنقاذ يمرّران reuseFailed للمحاولة الثانية",
    (retrySrc.match(/reuseFailed: n > 1/g) || []).length >= 2 &&
    /runWithRetry\(\(n\) => generateAndPublish/.test(retrySrc));

  /* 13) تعويض اليوم الناقص: يوم ضاع لا يعود من نفسه */
  chk("dayShift يعبر حدود الشهر", T.dayShift("2026-03-01", -1) === "2026-02-28" && T.dayShift("2026-11-12", -2) === "2026-11-10");
  const runsToday = [{ run_date: "2026-11-12", status: "published", run_key: "daily:u:2026-11-12" }];
  chk("يرجع الأيام الناقصة من الأحدث للأقدم", JSON.stringify(T.missingDays(runsToday, "2026-11-12", 2)) === JSON.stringify(["2026-11-11", "2026-11-10"]), JSON.stringify(T.missingDays(runsToday, "2026-11-12", 2)));
  chk("التعويض يأخذ الأحدث فقط (خطوة واحدة)", T.missingDays(runsToday, "2026-11-12", 2)[0] === "2026-11-11");
  chk("أمس منشور ⇒ يرجع ما قبله",
    JSON.stringify(T.missingDays([...runsToday, { run_date: "2026-11-11", status: "published" }], "2026-11-12", 2)) === JSON.stringify(["2026-11-10"]));
  chk("محاولة تعويض سابقة لا تُعاد",
    JSON.stringify(T.missingDays([...runsToday, { run_date: "2026-11-11", status: "failed", run_key: "daily:u1:2026-11-11:backfill" }], "2026-11-12", 2)) === JSON.stringify(["2026-11-10"]));
  chk("لا نعوّض اليوم نفسه (catchUp يتولاه)", T.missingDays(runsToday, "2026-11-12", 0).length === 0 && !T.missingDays([], "2026-11-12", 2).includes("2026-11-12"));

  impl.q = async () => [];
  impl.rest = async () => [];
  chk("بلا إعدادات مُفعّلة ⇒ لا تعويض", (await T.backfillDaily()).length === 0);

  impl.q = async () => [{ user_id: "u1", enabled: true, platforms: ["youtube"] }];
  impl.rest = async () => [{ run_date: "2026-11-12", status: "failed", run_key: "daily:u1:2026-11-12" }];
  const bf1 = await T.backfillDaily();
  chk("اليوم غير منشور ⇒ لا تعويض (الأولوية لليوم)", bf1.length === 1 && bf1[0].skipped === "today-pending", JSON.stringify(bf1));

  const publishedToday = [
    { run_date: "2026-11-12", status: "published", run_key: "daily:u1:2026-11-12" },
    { run_date: "2026-11-11", status: "published", run_key: "daily:u1:2026-11-11" },
    { run_date: "2026-11-10", status: "published", run_key: "daily:u1:2026-11-10" },
  ];
  impl.rest = async () => publishedToday;
  const bf2 = await T.backfillDaily();
  chk("كل الأيام منشورة ⇒ لا شيء", bf2.length === 1 && bf2[0].skipped === "nothing-missing", JSON.stringify(bf2));

  impl.rest = async () => [publishedToday[0], { run_date: "2026-11-11", status: "failed", run_key: "daily:u1:2026-11-11" }];
  const savedFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, text: async () => '<div id="exportOverlay"></div>' });
  impl.q = async (sql) => (/from autopilot where enabled/i.test(String(sql)) ? [{ user_id: "u1", enabled: true, platforms: ["youtube"] }] : []);
  dbCalls.length = 0;
  impl.rest = async (p2, opts) => {
    if (/autopilot_runs/.test(String(p2)) && (!opts || opts.method !== "POST")) return [publishedToday[0], { run_date: "2026-11-11", status: "failed", run_key: "daily:u1:2026-11-11" }];
    dbCalls.push({ p: p2, opts });
    return [];
  };
  const bf3 = await T.backfillDaily();
  chk("نسخة ناقصة ⇒ يتوقف قبل الرندر بلا حرق ميزانية", bf3.length === 1 && bf3[0].skipped === "preflight" && bf3[0].day === "2026-11-11", JSON.stringify(bf3));
  chk("فشل الفحص يُسجَّل في system_checks", dbCalls.some((c) => /system_checks/.test(String(c.p))));
  global.fetch = savedFetch;

  const bfSrc = fs.readFileSync(path.join(ROOT, "lib", "autopilot.js"), "utf8");
  chk("التعويض يستخدم يومًا صريحًا ومفتاحًا خاصًا",
    /runDate: day, runKeySuffix: "backfill"/.test(bfSrc) && /runDate: dayOverride/.test(bfSrc));
  const monSrc2 = fs.readFileSync(path.join(ROOT, "api", "cron", "monitor.js"), "utf8");
  chk("كرون الإنقاذ يعوّض بعد ضمان اليوم فقط",
    /backfillDaily\(\)/.test(monSrc2) && /todaySettled/.test(monSrc2) && /rescue-pending/.test(monSrc2));
  chk("الدوال متاحة للاستخدام خارج الوحدة (كرون/محاكي)", ["backfillDaily", "catchUpDaily", "missingDays", "dayShift"].every((k) => typeof T[k] === "function"));
  chk("نتيجة التعويض تحمل مفتاحها ويومها", /run_key: `daily:\$\{userId\}:\$\{day\}:backfill`/.test(bfSrc));
  impl.q = async () => [];
  impl.rest = async () => [];

  /* 14) إن فشل النشر فقط: نعيد النشر بلا إعادة توليد (ولا منشور مكرر) */
  const queueRow = (id, platform) => ({ id, platform, connection_id: null, video_path: `u1/autopilot/2026-11-12-run1.mp4`, video_name: "x.mp4", title: "t", caption: "c", hashtags: "", status: "failed" });
  const sqlCalls = [];
  impl.q = async (sql) => {
    const s2 = String(sql);
    sqlCalls.push(s2);
    if (/from autopilot where enabled/i.test(s2)) return [{ user_id: "u1", enabled: true, platforms: ["youtube"] }];
    if (/from publish_queue/i.test(s2)) return /status='published'/i.test(s2) ? [] : [queueRow("q1", "youtube")];
    return [];
  };
  impl.rest = async (p2) => (/autopilot_runs/.test(String(p2)) ? [{ id: "r1", status: "failed", run_key: "daily:u1:2026-11-12" }] : []);
  pub.calls.length = 0; dbCalls.length = 0;
  pub.impl = async (row) => ({ ok: true, url: "https://youtu.be/" + row.id });
  const cResume = await T.catchUpDaily();
  chk("فشل النشر فقط ⇒ إعادة نشر بلا إعادة توليد",
    cResume.length === 1 && cResume[0].ok === true && cResume[0].skipped === "rendered-cached" && cResume[0].resumed === true,
    JSON.stringify(cResume).slice(0, 240));
  chk("إعادة النشر تستخدم صفّ القائمة نفسه", pub.calls.length === 1 && pub.calls[0].id === "q1");
  chk("التشغيل يُصحَّح إلى published بالرابط",
    sqlCalls.some((q) => /update autopilot_runs set status='published'/.test(String(q))));

  /* فشل جزئي: منصة نجحت وأخرى لا ⇒ لا إعادة توليد (كي لا يتكرر المنشور) */
  impl.q = async (sql) => (/from publish_queue/i.test(sql)
    ? (/status='published'/i.test(sql) ? [] : [queueRow("q1", "youtube"), queueRow("q2", "tiktok")])
    : (/from autopilot where enabled/i.test(sql) ? [{ user_id: "u1", enabled: true, platforms: ["youtube", "tiktok"] }] : []));
  pub.calls.length = 0;
  let pubSeq = 0;
  pub.impl = async (row) => (++pubSeq === 1 ? { ok: true, url: "https://youtu.be/ok" } : { ok: false, error: "token" });
  const cPartial = await T.catchUpDaily();
  chk("نشر جزئي ⇒ يتوقف بلا إعادة توليد", cPartial.length === 1 && cPartial[0].skipped === "partial-publish" && cPartial[0].ok === false, JSON.stringify(cPartial).slice(0, 240));

  // اليوم منشور جزئيًا؛ نعيد المنصة الفاشلة فقط من الفيديو نفسه.
  impl.q = async (sql) => {
    if (/from autopilot where enabled/i.test(sql)) return [{ user_id: "u1", enabled: true, platforms: ["youtube", "tiktok"] }];
    if (/from publish_queue/i.test(sql) && /status='failed'/i.test(sql)) return [queueRow("tiktok-failed", "tiktok")];
    if (/from publish_queue/i.test(sql) && /status='published'/i.test(sql) && /select id, video_path/i.test(sql)) return [{ id: "yt-published", video_path: `u1/autopilot/${A.cairoDate()}-run1.mp4` }];
    return [];
  };
  pub.calls.length = 0;
  pub.impl = async (row) => ({ ok: true, url: "https://example.test/" + row.id });
  const resumedPartial = await T.catchUpDaily();
  chk("منشور جزئيًا ⇒ يعيد المنصة الفاشلة بلا توليد أو إعادة الناجحة", resumedPartial.length === 1 && resumedPartial[0].skipped === "rendered-cached" && pub.calls.length === 1 && pub.calls[0].id === "tiktok-failed", JSON.stringify(resumedPartial));

  /* فشل النشر كله ⇒ الفيديو الجاهز يبقى ولا نعيد توليده */
  impl.q = async (sql) => (/from publish_queue/i.test(sql)
    ? (/status='published'/i.test(sql) ? [] : [queueRow("q1", "youtube")])
    : (/from autopilot where enabled/i.test(sql) ? [{ user_id: "u1", enabled: true, platforms: ["youtube"] }] : []));
  pub.calls.length = 0;
  pub.impl = async () => ({ ok: false, error: "token" });
  global.fetch = async () => ({ ok: true, status: 200, text: async () => '<div id="exportOverlay"></div><div id="expPct"></div><div id="expStage"></div><div id="expRunning"></div><div id="expResult"></div><button id="btnCancelExport"></button>' });
  const cFull = await T.catchUpDaily();
  chk("فشل النشر كله ⇒ لا إعادة توليد", cFull.length === 1 && cFull[0].skipped === "publish-failed" && pub.calls.length === 1, JSON.stringify(cFull).slice(0, 240));

  /* لا صفوف فاشلة ⇒ لا استدعاء للنشر */
  impl.q = async (sql) => (/from autopilot where enabled/i.test(sql) ? [{ user_id: "u1", enabled: true, platforms: ["youtube"] }] : []);
  pub.calls.length = 0;
  await T.catchUpDaily();
  chk("بلا صفوف فاشلة ⇒ لا نداء نشر", pub.calls.length === 0);
  impl.q = async () => [];
  impl.rest = async () => [];
  pub.impl = async (row) => ({ ok: true, url: "https://youtu.be/r-" + row.id });
  pub.calls.length = 0;

  /* 14c) تشغيل أساسي قُتل وترك صفّه rendering ⇒ الإنقاذ ينظّفه ولا يتخطاه */
  const sqlSeen = [];
  impl.q = async (sql, params) => {
    const s2 = String(sql);
    sqlSeen.push({ sql: s2, params });
    if (/from autopilot where enabled/i.test(s2)) return [{ user_id: "u1", enabled: true, platforms: ["youtube"] }];
    return [];
  };
  impl.rest = async (p2) => (/autopilot_runs/.test(String(p2)) ? [{ id: "r1", status: "failed", run_key: "daily:u1:2026-11-12" }] : []);
  await T.catchUpDaily();
  const stale = sqlSeen.find((c) => /update autopilot_runs set status='failed'/.test(c.sql));
  chk("الإنقاذ يغلق التشغيلات العالقة قبل الحكم عليها",
    Boolean(stale) && /تنظيف تلقائي/.test(String(stale.params[0])) &&
    Math.abs((Date.now() - Date.parse(stale.params[1])) / 60000 - 20) < 1,
    stale ? JSON.stringify(stale.params) : "لم يُستدعَ closeStaleRuns");
  /* والصفّ العالق فعليًا لا يُقرأ «جارٍ» بعد التنظيف: نتحقق من الترتيب في المصدر */
  const cuSrc = fs.readFileSync(path.join(ROOT, "lib", "autopilot.js"), "utf8");
  const catchUpBody = cuSrc.slice(cuSrc.indexOf("async function catchUpDaily"), cuSrc.indexOf("async function backfillDaily"));
  chk("التنظيف يسبق قراءة صفوف اليوم في الإنقاذ",
    catchUpBody.indexOf("closeStaleRuns(20)") > -1 && catchUpBody.indexOf("closeStaleRuns(20)") < catchUpBody.indexOf("select=id,status,run_key"));

  /* 15) منع النشر المكرر: صفّ منشور في القائمة يتقدّم على حالة التشغيل */
  impl.q = async (sql) => {
    const s2 = String(sql);
    if (/from autopilot where enabled/i.test(s2)) return [{ user_id: "u1", enabled: true, platforms: ["youtube"] }];
    /* الفلترة على يوم التشغيل صارت في جافاسكربت (لا like في SQL) — فالبديل
     * يجب أن يحمل مسارًا يحمل علامة اليوم الفعلي. */
    if (/from publish_queue/i.test(s2) && /status='published'/i.test(s2)) return [{ id: "qp", video_path: `u1/autopilot/${A.cairoDate()}-run1.mp4` }];
    if (/from publish_queue/i.test(s2)) return [];
    return [];
  };
  impl.rest = async (p2) => (/autopilot_runs/.test(String(p2)) ? [{ id: "r1", status: "failed", run_key: "daily:u1:2026-11-12" }] : []);
  pub.calls.length = 0;
  const cPub = await T.catchUpDaily();
  chk("نُشر شيء اليوم ⇒ لا توليد ولا تكرار",
    cPub.length === 1 && cPub[0].skipped === "published-cached" && cPub[0].ok === true && pub.calls.length === 0,
    JSON.stringify(cPub).slice(0, 240));

  /* التعويض لا يعيد يومًا نُشر فيه شيء فعليًا */
  impl.rest = async (p2) => (/autopilot_runs/.test(String(p2)) ? [
    { run_date: "2026-11-12", status: "published", run_key: "daily:u1:2026-11-12" },
    { run_date: "2026-11-11", status: "failed", run_key: "daily:u1:2026-11-11" },
  ] : []);
  const bfPub = await T.backfillDaily();
  /* كان الاختبار يتوقّع «already-published» لليوم 11 لأن dayHasPublish كانت
   * تُسقط شرط المسار فترى صفوف اليوم 12 وتقول «نُشر» لكل يوم. الصواب: اليوم 12
   * منشور (يُتخطى)، واليوم 11 فاشل فيُعالَج. */
  chk("التعويض يعالج اليوم الفاشل (11) ولا يعيد المنشور (12)",
    bfPub.length === 1 && bfPub[0].day === "2026-11-11" && bfPub[0].backfill === true, JSON.stringify(bfPub));

  /* الفحص السلوكي للدالة نفسها: يوم بيوم لا «أي صفّ منشور» */
  impl.q = async (sql) => {
    if (/status='published'/i.test(sql)) return [{ id: "p1", video_path: "u1/autopilot/2026-11-12-run1.mp4" }];
    return [];
  };
  const has12 = await T.dayHasPublish("u1", "2026-11-12");
  const has11 = await T.dayHasPublish("u1", "2026-11-11");
  chk("dayHasPublish تخصّ اليوم المطلوب (لا «أي صفّ منشور»)", has12 === true && has11 === false, JSON.stringify({ has12, has11 }));

  // بقية الدفعة لا تختفي من تقرير الإنقاذ حين تنتهي أول ثلاث بلا توليد.
  impl.q = async (sql) => /from autopilot where enabled/i.test(sql)
    ? Array.from({ length: 5 }, (_, i) => ({ user_id: "u" + i, platforms: ["youtube"] })) : [];
  impl.rest = async (p) => /autopilot_runs/.test(p) && /user_id=eq/.test(p) ? [{ status: "published" }] : [];
  const waiting = await T.catchUpDaily();
  chk("الإنقاذ يبلّغ عن الحسابات المتبقية خارج الدفعة", waiting.some(r => r.skipped === "deferred" && r.count === 2) && waiting.filter(r => r.skipped === "published").length === 3, JSON.stringify(waiting));

  /* القاعدة غير متاحة لا تعني أن اليوم فارغًا؛ نتوقف قبل الرندر والنشر. */
  let networkCalls = 0;
  global.fetch = async () => { networkCalls++; throw new Error("unexpected preflight"); };
  const config = { user_id: "u1", enabled: true, platforms: ["youtube"] };
  impl.q = async (sql) => /from autopilot where enabled/i.test(sql) ? [config] : [];
  impl.rest = async (p) => {
    if (/autopilot_runs/.test(p) && /user_id=eq/.test(p)) throw new Error("db down");
    return [];
  };
  const checkFail = await T.catchUpDaily();
  chk("تعذّر قراءة تشغيل المستخدم ⇒ توقف بلا توليد", checkFail.some(r => r.skipped === "db-unavailable" && r.ok === false) && networkCalls === 0);
  impl.rest = async () => [];
  impl.q = async (sql) => {
    if (/from autopilot where enabled/i.test(sql)) return [config];
    if (/from publish_queue/i.test(sql) && /status='published'/i.test(sql)) throw new Error("db down");
    return [];
  };
  const publishedFail = await T.catchUpDaily();
  chk("تعذّر فحص المنشورات ⇒ توقف بلا توليد", publishedFail.some(r => r.skipped === "db-unavailable" && r.ok === false) && networkCalls === 0);
  impl.q = async (sql) => {
    if (/from autopilot where enabled/i.test(sql)) return [config];
    if (/from publish_queue/i.test(sql) && /status='failed'/i.test(sql)) throw new Error("db down");
    return [];
  };
  const failedFail = await T.catchUpDaily();
  chk("تعذّر فحص الفيديو الجاهز ⇒ توقف بلا توليد", failedFail.some(r => r.skipped === "db-unavailable" && r.ok === false) && networkCalls === 0);
  const retryFail = await A.publishReadyToday("u1");
  chk("تعذّر قاعدة الفيديو الجاهز لا يُعرض كغياب فيديو", retryFail.ok === false && /تعذّر قراءة/.test(retryFail.error));
  global.fetch = savedFetch;

  chk("dayHasPublish متاحة ومحصورة بصفوف published",
    typeof T.dayHasPublish === "function" && /status='published'/.test(fs.readFileSync(path.join(ROOT, "lib", "autopilot.js"), "utf8")));
  impl.q = async () => [];
  impl.rest = async () => [];
  pub.calls.length = 0;

  console.log(errs.length ? `ERRORS ${errs.length}` : `ALL OK (${pass} checks)`);
  if (errs.length) console.log(errs.map((e) => " - " + e).join("\n"));
  process.exit(errs.length ? 1 : 0);
})().catch((e) => {
  console.log("FAIL استثناء غير متوقع: " + (e && e.stack ? e.stack.split("\n").slice(0, 2).join(" | ") : e));
  process.exit(1);
});

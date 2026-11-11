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
  chk("يُثبّت مسارًا واحدًا على الصفحة", installed === true && routes.length === 1);
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
    /await installAudioRoute\(page\);\s*\n\s*await page\.goto/.test(fs.readFileSync(path.join(ROOT, "lib", "autopilot.js"), "utf8")));

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
  chk("runDailyAutopilots يستخدم الإعادة والتسجيل", src.includes("runWithRetry(() => generateAndPublish") && src.includes("recordDaily(config.user_id"));
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
  chk("لا يمسّ التشغيلات الحديثة (نافذة زمنية)", dbCalls.some((c) => /\(\$2 \|\| ' minutes'\)::interval/.test(c.sql)));

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

  console.log(errs.length ? `ERRORS ${errs.length}` : `ALL OK (${pass} checks)`);
  if (errs.length) console.log(errs.map((e) => " - " + e).join("\n"));
  process.exit(errs.length ? 1 : 0);
})().catch((e) => {
  console.log("FAIL استثناء غير متوقع: " + (e && e.stack ? e.stack.split("\n").slice(0, 2).join(" | ") : e));
  process.exit(1);
});

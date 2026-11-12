#!/usr/bin/env node
/* ============================================================
 * اختبار «أعد نشر الفيديو الجاهز» — منع النشر المكرر
 * ------------------------------------------------------------
 * الدرس (2026-11-12): تشغيل واحد أنشأ صفَّين فاشلين ليوتيوب لنفس الملف.
 * لو أعاد المستخدم الربط ونشرنا كل الصفوف، صار عندنا فيديوان متطابقان على
 * القناة. هنا نُثبت أننا ننشر الأول فقط ونحوّل الباقي إلى draft.
 *
 * التشغيل: node tests/retry_publish_test.js
 * ============================================================ */
const path = require("path");
const Module = require("module");

const ROOT = path.join(__dirname, "..");
let pass = 0;
const errs = [];
const ok = (m) => { pass++; console.log("OK   " + m); };
const fail = (m) => { errs.push(m); console.log("FAIL " + m); };
const chk = (n, c, extra = "") => (c ? ok(n) : fail(n + (extra ? " :: " + extra : "")));

/* chromium/playwright غير مطلوبين هنا لكن الوحدة تستوردهما عند التحميل */
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

/* بديل قاعدة البيانات */
const sql = [];
let qRows = [];
const impl = { q: async () => [], rest: async () => [] };
impl.q = async (text, params) => {
  sql.push({ text, params });
  return /from publish_queue/.test(text) ? qRows : [];
};
const dbStub = { q: (...a) => impl.q(...a), q1: async () => null, rest: (...a) => impl.rest(...a) };
require.cache[require.resolve(path.join(ROOT, "lib", "db.js"))] = {
  id: "db", filename: "db", loaded: true, exports: dbStub,
};

/* بديل النشر */
const pub = { calls: [], impl: async (row) => ({ ok: true, url: "https://youtu.be/" + row.id }) };
const pubPath = require.resolve(path.join(ROOT, "lib", "publish.js"));
require.cache[pubPath] = {
  id: "publish", filename: "publish", loaded: true,
  exports: { publishRow: async (row) => { pub.calls.push(row.id); return pub.impl(row); }, videoUrl: () => "", pickConnection: () => null },
};

const A = require(path.join(ROOT, "lib", "autopilot.js"));
const T = A.__test;

const reset = () => { sql.length = 0; pub.calls.length = 0; qRows = []; pub.impl = async (row) => ({ ok: true, url: "https://youtu.be/" + row.id }); };

(async () => {
  chk("retryPublishFailed مُصدَّرة للاختبار", typeof T.retryPublishFailed === "function");

  /* 1) دون صفوف ⇒ null (لا شيء جاهز) */
  reset();
  chk("بلا صفوف فاشلة يعيد null", (await T.retryPublishFailed("u1", "2026-11-12")) === null);

  /* 2) صفّان لنفس المنصة ⇒ نشر واحد + تحويل الثاني إلى draft */
  reset();
  qRows = [
    { id: "r1", platform: "youtube", video_path: "u/autopilot/2026-11-12-a.mp4" },
    { id: "r2", platform: "youtube", video_path: "u/autopilot/2026-11-12-a.mp4" },
  ];
  const out2 = await T.retryPublishFailed("u1", "2026-11-12");
  chk("صفّان لنفس المنصة ⇒ نشر واحد فقط",
    pub.calls.length === 1 && pub.calls[0] === "r1", JSON.stringify(pub.calls));
  chk("الصفّ المكرر يُحوَّل إلى draft (حالة مسموحة) مع سبب",
    sql.some((s) => /update publish_queue set status='draft'/.test(s.text) && Array.isArray(s.params[0]) && s.params[0][0] === "r2"),
    JSON.stringify(sql.map((s) => s.text.slice(0, 50))));
  chk("النتيجة تُبلغ عن المكرر",
    out2 && out2.published.length === 1 && out2.duplicates === 1 && out2.attempted === 1,
    JSON.stringify(out2));

  /* 3) منصتان مختلفتان ⇒ نشر كلتيهما */
  reset();
  qRows = [
    { id: "a1", platform: "youtube" },
    { id: "a2", platform: "instagram" },
  ];
  const out3 = await T.retryPublishFailed("u1", "2026-11-12");
  chk("منصتان مختلفتان ⇒ نشر مرتين", pub.calls.length === 2 && out3.published.length === 2, JSON.stringify(out3));

  /* 4) فشل النشر لا يرمي ويُحصى */
  reset();
  qRows = [{ id: "f1", platform: "youtube" }];
  pub.impl = async () => ({ ok: false, error: "invalid_grant" });
  const out4 = await T.retryPublishFailed("u1", "2026-11-12");
  chk("فشل النشر يُحصى بلا استثناء", out4 && out4.failed === 1 && out4.published.length === 0, JSON.stringify(out4));

  /* 4b) فشل النشر لا يُعيد التوليد (كان ينتج صفًّا مكررًا) */
  let n = 0;
  const publishFail = async () => { n++; return { ok: false, stage: "publish", error: "فشل النشر" }; };
  const noRetry = await T.runWithRetry(publishFail, { budgetMs: 999999 });
  chk("فشل النشر لا يُعاد توليده", n === 1 && noRetry.attempts === 1, JSON.stringify({ n, attempts: noRetry.attempts }));
  let m2 = 0;
  const renderFail = async () => { m2++; return { ok: false, error: "توليد الفيديو لم يكتمل" }; };
  const withRetry = await T.runWithRetry(renderFail, { budgetMs: 999999 });
  chk("فشل التوليد ما زال يُعاد مرة واحدة", m2 === 2 && withRetry.attempts === 2, JSON.stringify({ m2, attempts: withRetry.attempts }));

  /* 4c) صفّ النشر لا يتكرر لنفس (منصة، ملف) */
  reset();
  const posts = [];
  impl.rest = async (p, opts = {}) => {
    if (/publish_queue/.test(p) && (!opts.method || opts.method === "GET")) {
      if (/status=in\.\(failed,scheduled,draft\)/.test(p)) return [{ id: "q1", platform: "youtube", video_path: "u/autopilot/x.mp4", status: "failed" }];
      return [];
    }
    if (/publish_queue\?id=eq\.q1/.test(p) && opts.method === "PATCH") return [{ id: "q1", platform: "youtube", video_path: "u/autopilot/x.mp4", status: "scheduled" }];
    if (/publish_queue$/.test(p) && opts.method === "POST") { posts.push(p); return []; }
    return [];
  };
  const reused = await T.ensureQueueRow({ userId: "u1", platform: "youtube", connectionId: null, storagePath: "u/autopilot/x.mp4", videoName: "v.mp4", meta: { title: "t", caption: "c", hashtags: "#a" } });
  chk("صفّ قائم يُعاد استخدامه بلا إدراج جديد",
    reused && reused.id === "q1" && reused.status === "scheduled" && posts.length === 0, JSON.stringify({ reused, posts: posts.length }));

  reset();
  const posts2 = [];
  impl.rest = async (p, opts = {}) => {
    if (/publish_queue/.test(p) && /status=in\.\(failed,scheduled,draft\)/.test(p)) return [];
    if (/publish_queue$/.test(p) && opts.method === "POST") { posts2.push(p); return [{ id: "new1", platform: "youtube", status: "scheduled" }]; }
    return [];
  };
  const created = await T.ensureQueueRow({ userId: "u1", platform: "youtube", connectionId: null, storagePath: "u/autopilot/y.mp4", videoName: "v.mp4", meta: { title: "t", caption: "c", hashtags: "#a" } });
  chk("بلا صفّ قائم يُدرج صفًّا واحدًا", created && created.id === "new1" && posts2.length === 1, JSON.stringify({ created, posts2: posts2.length }));

  /* 5) publishReadyToday تستخدم نفس المسار وتُعلن السبب */
  reset();
  const ready = await A.publishReadyToday("u1");
  chk("publishReadyToday بلا فيديو جاهز تعيد سببًا واضحًا",
    ready && ready.ok === false && /لا يوجد فيديو جاهز/.test(ready.error), JSON.stringify(ready));

  console.log(errs.length ? `ERRORS ${errs.length}` : `ALL OK (${pass} checks)`);
  if (errs.length) console.log(errs.map((e) => " - " + e).join("\n"));
  process.exit(errs.length ? 1 : 0);
})().catch((e) => { console.log("FAIL استثناء غير متوقع: " + (e && e.message)); process.exit(1); });

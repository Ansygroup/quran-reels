#!/usr/bin/env node
/* ============================================================
 * اختبار «أعد نشر الفيديو الجاهز» — منع النشر المكرر
 * ------------------------------------------------------------
 * الدرس (2026-11-12): تشغيل واحد أنشأ صفَّين فاشلين ليوتيوب لنفس الملف.
 * لو أُعيد نشر هذه الصفوف قد يتكرر الفيديو. نتحقق من حجب الفاشل وعدم
 * تحويله إلى مجدول أو محاولة رفعه تلقائيًا.
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
let publishedRows = [];
let reclaimRows = [];
const impl = { q: async () => [], rest: async () => [] };
impl.q = async (text, params) => {
  sql.push({ text, params });
  if (/status='publishing'/.test(text)) return reclaimRows;
  if (/from publish_queue/.test(text) && /status='published'/.test(text)) {
    return publishedRows.filter(r => r.platform === params[1] && (!/connection_id=\$4/.test(text) || r.connection_id === params[3]) && (!/connection_id is null/.test(text) || !r.connection_id));
  }
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

const reset = () => { sql.length = 0; pub.calls.length = 0; qRows = []; publishedRows = []; reclaimRows = []; pub.impl = async (row) => ({ ok: true, url: "https://youtu.be/" + row.id }); };

(async () => {
  chk("retryPublishFailed مُصدَّرة للاختبار", typeof T.retryPublishFailed === "function");

  /* 1) دون صفوف ⇒ null (لا شيء جاهز) */
  reset();
  chk("بلا صفوف فاشلة يعيد null", (await T.retryPublishFailed("u1", "2026-11-12")) === null);

  /* النتيجة المجهولة لا تُعاد آليًا حتى لو وُجد صفان أو منصتان. */
  reset();
  qRows = [
    { id: "r1", platform: "youtube", connection_id: "c1", video_path: "u/autopilot/2026-11-12-a.mp4" },
    { id: "r2", platform: "youtube", connection_id: "c1", video_path: "u/autopilot/2026-11-12-a.mp4" },
    { id: "r3", platform: "youtube", connection_id: "c2", video_path: "u/autopilot/2026-11-12-a.mp4" },
  ];
  const blocked = await T.retryPublishFailed("u1", "2026-11-12");
  chk("صفوف الفشل الغامضة تُحجب ولا يُرفع أي منها", pub.calls.length === 0 && blocked.blocked === 3 && blocked.failed === 3);
  chk("لا تعديل اعتباطي للصفوف المكررة", !sql.some(s => /set status='draft'/.test(s.text)));

  reset();
  qRows = Array.from({ length: 50 }, (_, id) => ({ id: String(id), platform: "youtube", video_path: "u/autopilot/2026-11-12-a.mp4" }));
  let capBlocked = false;
  try { await T.retryPublishFailed("u1", "2026-11-12"); } catch { capBlocked = true; }
  chk("بلوغ حد القراءة يوقف المحاولة بدل إعلان اكتمال ناقص", capBlocked && pub.calls.length === 0);

  /* 4) فشل النشر لا يرمي ويُحصى */
  reset();
  qRows = [{ id: "f1", platform: "youtube", video_path: "u/autopilot/2026-11-12-a.mp4" }];
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
  let failedBlocked = false;
  let failedWrites = 0;
  const previousRest = impl.rest;
  impl.rest = async (p, opts = {}) => { if (opts.method) failedWrites++; return previousRest(p, opts); };
  try { await T.ensureQueueRow({ userId: "u1", platform: "youtube", connectionId: null, storagePath: "u/autopilot/x.mp4", videoName: "v.mp4", meta: { title: "t", caption: "c", hashtags: "#a" } }); } catch { failedBlocked = true; }
  chk("الصف الفاشل لا يتحول لمجدول ولا يُنشأ بديل", failedBlocked && failedWrites === 0 && posts.length === 0);

  let normalWrites = 0;
  impl.rest = async (p, opts = {}) => {
    if (!opts.method) return [{ id: "q1", status: "draft" }];
    normalWrites++; return [{ id: "q1", status: "scheduled" }];
  };
  const reused = await T.ensureQueueRow({ userId: "u1", platform: "youtube", connectionId: null, storagePath: "u/autopilot/x.mp4", videoName: "v.mp4", meta: { title: "t", caption: "c", hashtags: "#a" } });
  chk("إعادة استخدام المسودة مشروطة بحالتها", reused && reused.id === "q1" && normalWrites === 1);

  impl.rest = async () => ({ error: "not an array" });
  let invalidBlocked = false;
  try { await T.ensureQueueRow({ userId: "u1", platform: "youtube", storagePath: "u/autopilot/x.mp4", meta: {} }); } catch { invalidBlocked = true; }
  chk("رد قراءة غير صالح لا يسمح بإدراج صف", invalidBlocked);

  reset();
  let conflictInserts = 0;
  impl.rest = async (p, opts = {}) => {
    if (!opts.method) return [{ id: "q1", status: "failed" }];
    if (opts.method === "PATCH") return [];
    if (opts.method === "POST") conflictInserts++;
    return [];
  };
  let conflictBlocked = false;
  try { await T.ensureQueueRow({ userId: "u1", platform: "youtube", connectionId: null, storagePath: "u/autopilot/x.mp4", videoName: "v", meta: {} }); } catch { conflictBlocked = true; }
  chk("تغير حالة الصف أثناء التحضير لا ينشئ بديلًا", conflictBlocked && conflictInserts === 0);

  reset();
  const posts2 = [];
  impl.rest = async (p, opts = {}) => {
    if (/publish_queue/.test(p) && /status=in\.\(failed,scheduled,draft\)/.test(p)) return [];
    if (/publish_queue$/.test(p) && opts.method === "POST") { posts2.push(p); return [{ id: "new1", platform: "youtube", status: "scheduled" }]; }
    return [];
  };
  const created = await T.ensureQueueRow({ userId: "u1", platform: "youtube", connectionId: null, storagePath: "u/autopilot/y.mp4", videoName: "v.mp4", meta: { title: "t", caption: "c", hashtags: "#a" } });
  chk("بلا صفّ قائم يُدرج صفًّا واحدًا", created && created.id === "new1" && posts2.length === 1, JSON.stringify({ created, posts2: posts2.length }));

  const seenPaths = [];
  impl.rest = async (p, opts = {}) => {
    if (!opts.method) { seenPaths.push(p); return []; }
    if (opts.method === "POST") return [{ id: "new" }];
    return [];
  };
  await T.ensureQueueRow({ userId: "u1", platform: "youtube", connectionId: "c1", storagePath: "u/autopilot/x.mp4", videoName: "x", meta: {} });
  await T.ensureQueueRow({ userId: "u1", platform: "youtube", connectionId: "c2", storagePath: "u/autopilot/x.mp4", videoName: "x", meta: {} });
  chk("فحص التكرار مقيّد بمعرّف القناة", /connection_id=eq\.c1/.test(seenPaths[0]) && /connection_id=eq\.c2/.test(seenPaths[1]));
  let writes = 0;
  impl.rest = async (p, opts = {}) => { if (opts.method === "POST") writes++; throw new Error("db unavailable"); };
  let rejected = false;
  try { await T.ensureQueueRow({ userId: "u1", platform: "youtube", connectionId: "c1", storagePath: "x", meta: {} }); } catch { rejected = true; }
  chk("فشل فحص التكرار لا يُدرج صفًا جديدًا", rejected && writes === 0);

  impl.rest = async (p) => p.includes("platform=eq.instagram") ? [{ id: "ig", platform: "instagram" }] : [{ id: "fb", platform: "facebook" }];
  const igConns = await T.connectionsFor("u1", "instagram");
  chk("قنوات إنستغرام لا تشمل صفوف فيسبوك", igConns.length === 1 && igConns[0].id === "ig");

  /* 4d) صفّ عالق في publishing لا يضيع اليوم بصمت */
  chk("reclaimStalePublishing مُصدَّرة", typeof A.reclaimStalePublishing === "function" && typeof T.reclaimStalePublishing === "function");
  reset();
  reclaimRows = [{ id: "p1", platform: "youtube" }, { id: "p2", platform: "youtube" }];
  const n1 = await A.reclaimStalePublishing({ minutes: 20 });
  const upd = sql.find((s) => /status='publishing'/.test(s.text)) || {};
  const ageMin = (iso) => (Date.now() - Date.parse(iso)) / 60000;
  chk("الصفّ العالق يُعاد إلى failed بعد المهلة",
    n1 === 2 && /set status='failed'/.test(upd.text || "") && /updated_at < \$1/.test(upd.text || "") &&
    Math.abs(ageMin(upd.params[0]) - 20) < 1,
    JSON.stringify({ n1, age: upd.params && ageMin(upd.params[0]) }));
  chk("المهلة كافية لرفع حيّ (لا صفر يلمس رفعًا جاريًا)", upd.params && ageMin(upd.params[0]) >= 19, JSON.stringify(upd.params));

  reset();
  await A.reclaimStalePublishing({ minutes: 0, userId: "u1" });
  const upd2 = sql.find((s) => /status='publishing'/.test(s.text)) || {};
  chk("القيمة غير الصالحة تصير 20، والمستخدم مُقيَّد",
    upd2.params && Math.abs(ageMin(upd2.params[0]) - 20) < 1 && /and user_id=\$3/.test(upd2.text || "") && upd2.params[2] === "u1",
    JSON.stringify({ params: upd2.params, text: (upd2.text || "").slice(-40) }));

  reset();
  qRows = [{ id: "z1", platform: "youtube", video_path: "u/autopilot/2026-11-12-a.mp4" }];
  await T.retryPublishFailed("u1", "2026-11-12");
  const iPublish = sql.findIndex((s) => /status='publishing'/.test(s.text));
  const iSelect = sql.findIndex((s) => /from publish_queue/.test(s.text));
  chk("إعادة النشر تُنظّف العالق قبل قراءة الفاشلة",
    iPublish >= 0 && iSelect > iPublish, JSON.stringify({ iPublish, iSelect }));

  const cronSrc = require("fs").readFileSync(path.join(ROOT, "api", "cron", "publish.js"), "utf8");
  chk("كرون النشر ينظّف الصفوف العالقة ويُبلغ عنها",
    /reclaimStalePublishing\(\{ minutes: 20 \}\)/.test(cronSrc) && /reclaimed,/.test(cronSrc), "cron");

  /* 5) publishReadyToday تستخدم نفس المسار وتُعلن السبب */
  reset();
  const ready = await A.publishReadyToday("u1");
  chk("الفحص يصف نطاقه ولا يستنتج أن الفيديو لم يُولّد",
    ready && ready.ok === false && /محاولات نشر فاشلة/.test(ready.error) && !/لم يُولَّد/.test(ready.error), JSON.stringify(ready));

  console.log(errs.length ? `ERRORS ${errs.length}` : `ALL OK (${pass} checks)`);
  if (errs.length) console.log(errs.map((e) => " - " + e).join("\n"));
  process.exit(errs.length ? 1 : 0);
})().catch((e) => { console.log("FAIL استثناء غير متوقع: " + (e && e.message)); process.exit(1); });

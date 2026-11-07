#!/usr/bin/env node
/* ============================================================
 * اختبار DOM لواجهة الحساب/النشر (public/js/publish.js)
 * ------------------------------------------------------------
 * لماذا؟ لأن الملف كان يحتوي كود خادم (require/module.exports) فصار المتصفح
 * يفشل بـ ReferenceError: require is not defined وتتعطّل لوحة الحساب.
 * هنا نُحمّل الملف داخل DOM حقيقي (index.html) ونستدعي init() مع QRAuth/fetch
 * مُستبدلين، ونتأكد أنه يرسم بدون أخطاء.
 *
 * التشغيل: node tests/publish_client_dom.js
 * يحتاج jsdom (اختياري):  npm i --no-save jsdom   أو  NODE_PATH=… 
 * بدون jsdom يخرج بـ0 مع تنبيه «تخطّي» حتى لا يُعطّل بقية الحزمة.
 * ============================================================ */
const fs = require("fs");
const path = require("path");

let JSDOM = null;
try { JSDOM = require("jsdom").JSDOM; } catch { /* غير مثبّت */ }

const ROOT = path.join(__dirname, "..");
const errs = [];
const ok = (m) => console.log("OK   " + m);
const fail = (m) => { errs.push(m); console.log("FAIL " + m); };

if (!JSDOM) {
  console.log("WARN تخطّي اختبار DOM: jsdom غير مثبّت (npm i --no-save jsdom)");
  process.exit(0);
}

const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
const clientJs = fs.readFileSync(path.join(ROOT, "public", "js", "publish.js"), "utf8");

const ACCOUNT = {
  config: { enabled: true, at_utc: "04:15:00", platforms: ["youtube"], template: { content_mode: "mix" } },
  runs: [
    { id: "r1", title: "سورة الكوثر", status: "published", reciter: "السديس", created_at: "2026-11-07T04:15:00Z", external_url: "https://youtu.be/x" },
    { id: "r2", title: "سورة الإخلاص", status: "rendering", reciter: "الحصري", created_at: "2026-11-06T04:15:00Z" },
  ],
  connected: true,
  platforms: ["youtube"],
  channel: "يوتيوب · قناة قرآن",
  reciters: [{ id: "a", name: "السديس" }],
};

const dom = new JSDOM(html, { url: "https://quran-reels.test/#/account", runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;

const consoleErrors = [];
const alerts = [];
window.console.error = (...a) => consoleErrors.push(a.join(" "));
window.alert = (m) => { alerts.push(String(m)); };

// بدائل الشبكة والمصادقة
window.QRAuth = { user: () => ({ id: "u1", email: "a@b.c" }), token: async () => "test-token" };
const calls = [];
let action = "";
window.fetch = async (url, opts = {}) => {
  const method = opts.method || "GET";
  try { action = JSON.parse(opts.body || "{}").action || ""; } catch { action = ""; }
  calls.push({ url: String(url), method, body: opts.body, action });
  const payload =
    method === "GET" ? ACCOUNT :
    action === "save" ? { ok: true, config: ACCOUNT.config } :
    action === "run" ? { ok: true, url: "https://youtu.be/x" } :
    action === "run_all" ? { ok: true, results: [{ ok: true }, { ok: false }] } :
    action === "article_random" ? { ok: true, article_title: "مقال قرآني", url: "https://quran-reels.test/articles/1" } :
    { ok: true };
  return { ok: true, status: 200, json: async () => payload };
};

(async () => {
  try {
    window.eval(clientJs);
  } catch (e) {
    fail("تحميل public/js/publish.js رمى خطأ: " + e.message);
    return done();
  }
  ok("تحميل الملف في المتصفح بلا أخطاء (لا require/module.exports)");

  if (typeof window.PublishApp === "undefined" || typeof window.PublishApp.init !== "function") {
    fail("PublishApp غير معرّف بعد التحميل");
    return done();
  }
  ok("window.PublishApp معرّف");

  try {
    await window.PublishApp.init();
  } catch (e) {
    fail("PublishApp.init() رمى خطأ: " + e.message);
    return done();
  }
  ok("PublishApp.init() اكتمل بلا استثناءات");

  const d = window.document;
  const fetchCall = calls.find((c) => c.url.includes("/api/autopilot") && c.method === "GET");
  if (!fetchCall) fail("لم يطلب بيانات الحساب من /api/autopilot عبر GET");
  else ok("يقرأ البيانات من /api/autopilot (GET) — الخادم الذي يملك هذه الاستجابة فعلًا");

  const quick = d.getElementById("acctQuickActions");
  if (!quick || quick.hidden) fail("بطاقة الإجراءات السريعة لم تُعرض");
  else ok("بطاقة الإجراءات السريعة ظهرت");

  const ql = d.getElementById("queueList");
  const rows = ql ? ql.querySelectorAll(".auto-run") : [];
  if (rows.length !== ACCOUNT.runs.length) fail(`سجل التشغيل: ${rows.length} بدل ${ACCOUNT.runs.length}`);
  else ok(`سجل التشغيل عرض ${rows.length} مهمة`);

  const auto = d.getElementById("acctAuto");
  if (!auto || !/لوحة الأتمتة/.test(auto.textContent)) fail("لوحة الأتمتة لم تُرسم");
  else ok("لوحة الأتمتة رُسمت");

  if (!/يوتيوب/.test((d.getElementById("acctAuto") || {}).textContent || "")) fail("اسم القناة/المنصة لم يظهر");
  else ok("اسم القناة المرتبطة ظهر");

  // ---- أزرار اللوحة: كل إجراء يجب أن يذهب إلى /api/autopilot بالاسم الصحيح ----
  const click = async (id) => {
    const el = d.getElementById(id);
    if (!el) return fail(`زر مفقود في index.html: #${id}`);
    calls.length = 0; alerts.length = 0;
    el.dispatchEvent(new window.Event("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));
    return calls[0] || null;
  };

  const cases = [
    ["autoSave", "save"],
    ["autoRun", "run"],
    ["autoRunAll", "run_all"],
    ["autoGenArticle", "article_random"],
    ["quickRunAll", "run_all"], // زر الإجراءات السريعة يفوّض إلى autoRunAll
  ];
  for (const [id, action] of cases) {
    const c = await click(id);
    if (!c) { fail(`#${id}: لم يُرسل أي طلب`); continue; }
    if (!c.url.includes("/api/autopilot") || c.method !== "POST" || c.action !== action) {
      fail(`#${id}: أرسل ${c.method} ${c.url} action=${c.action} بدل POST /api/autopilot action=${action}`);
    } else ok(`#${id} → POST /api/autopilot {action:${action}}`);
    const bad = alerts.filter((a) => /خطأ|فشل|تعذّر/.test(a));
    if (bad.length) fail(`#${id}: تنبيه خطأ: ${bad[0].slice(0, 80)}`);
  }

  // زر الجدولة: شرح واضح محليًا بلا طلب شبكة (الجدولة تحتاج فيديو من صانع الريلز)
  const sched = d.getElementById("schedSave");
  if (sched) {
    calls.length = 0; alerts.length = 0;
    const t = d.getElementById("schedTitle"); if (t) t.value = "ريلز";
    const tm = d.getElementById("schedTime"); if (tm) tm.value = "06:00"; // type=time يقبل HH:MM
    const cb = d.querySelector('#schedPlatforms input[data-platform="youtube"]');
    if (cb) cb.checked = true;
    sched.dispatchEvent(new window.Event("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));
    if (calls.length) fail("#schedSave: أرسل طلبًا غير مدعوم على الخادم");
    else if (!alerts.some((a) => /جدولة/.test(a))) fail("#schedSave: لا رسالة توضيحية للمستخدم");
    else ok("#schedSave: رسالة توضيحية محليًا بلا طلب فاشل");
  }

  if (consoleErrors.length) fail("أخطاء console غير متوقعة: " + consoleErrors.slice(0, 3).join(" | "));
  else ok("لا أخطاء console");

  done();
})();

function done() {
  console.log(errs.length ? `ERRORS ${errs.length}` : "ALL OK (0 errors)");
  if (errs.length) console.log(errs.map((e) => " - " + e).join("\n"));
  process.exit(errs.length ? 1 : 0);
}

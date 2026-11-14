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
  config: { settings_revision: "11111111-1111-4111-8111-111111111111", all_channels: false, enabled: true, at_utc: "04:15:00", platforms: ["youtube"], template: { content_mode: "mix" } },
  runs: [
    { id: "r1", title: "سورة الكوثر", status: "published", reciter: "السديس", created_at: "2026-11-07T04:15:00Z", external_url: "https://youtu.be/x" },
    { id: "r2", title: "سورة الإخلاص", status: "rendering", reciter: "الحصري", created_at: "2026-11-06T04:15:00Z" },
  ],
  connected: true,
  platforms: ["youtube"],
  channel: "يوتيوب · قناة قرآن",
  reciters: [{ id: "a", name: "السديس" }],
  available: [
    { key: "youtube", name: "يوتيوب", publish: true },
    { key: "facebook", name: "فيسبوك", publish: true },
    { key: "instagram", name: "إنستغرام", publish: true },
    { key: "tiktok", name: "تيك توك", publish: true },
    { key: "x", name: "X", publish: true },
    { key: "linkedin", name: "لينكد إن", publish: false },
    { key: "telegram", name: "تيليجرام", publish: false },
    { key: "whatsapp", name: "واتساب", publish: false },
  ],
  articles: { count: 500 },
  /* آخر تشغيل آلي: فاشل بسبب نص يحوي وسمًا — يختبر العرض والتهريب معًا */
  last_daily: { run_date: "2026-11-11", status: "failed", error: "توقّف عند «تحضير التلاوة» <b>x</b>", external_url: null },
  /* آخر فحص محفوظ: فشل توليد كامل التشخيص — يختبر العرض + التهريب */
  last_check: {
    kind: "render_failure", ok: false, created_at: "2026-11-11T04:20:00Z",
    detail: {
      error: "توليد الفيديو توقّف عند «<b>تحضير التلاوة</b>» (0%)",
      diag: {
        kind: "stall", stage: "<i>تحضير التلاوة</i>", pct: "0%",
        last: { exporting: false, running: false, count: 0, dialog: false, toast: "حدّد آية أولًا", abort: "" },
        errors: ["console: TypeError <script>", "pageerror: x"],
      },
    },
  },
};

const dom = new JSDOM(html, { url: "https://quran-reels.test/#/account", runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;

const consoleErrors = [];
const alerts = [];
window.console.error = (...a) => consoleErrors.push(a.join(" "));
window.alert = (m) => { alerts.push(String(m)); };
window.confirm = () => true;

// بدائل الشبكة والمصادقة
window.QRAuth = { user: () => ({ id: "u1", email: "a@b.c" }), token: async () => "test-token" };
window.AuthApp = { getToken: async () => "test-token", getUserId: () => "u1", user: () => ({ id: "u1", email: "a@b.c" }) };
const calls = [];
let action = "";
window.fetch = async (url, opts = {}) => {
  const method = opts.method || "GET";
  try { action = JSON.parse(opts.body || "{}").action || ""; } catch { action = ""; }
  calls.push({ url: String(url), method, body: opts.body, action });
  const payload =
    method === "GET" ? ACCOUNT :
    action === "save" ? { ok: true, config: { ...JSON.parse(opts.body), settings_revision: "22222222-2222-4222-8222-222222222222" } } :
    action === "run" ? { ok: true, url: "https://youtu.be/x" } :
    action === "run_all" ? { ok: true, run_id: "r3" } :
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
    await new Promise(resolve => setTimeout(resolve, 20));
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

  /* ---- التصميم الجديد: بطاقة حالة + خطوات + أرقام + لوحة تخصيص قابلة للتعديل ---- */
  const auto = d.getElementById("acctAuto");
  if (!auto || !/التخصيص/.test(auto.textContent)) fail("لوحة التخصيص لم تُرسم");
  else ok("لوحة التخصيص رُسمت");

  const stateLabel = d.getElementById("acctStateLabel");
  const dot = d.getElementById("acctDot");
  const toggle = d.getElementById("acctEnabled");
  if (!stateLabel || !/./.test(stateLabel.textContent) || !dot || !toggle) fail("بطاقة الحالة غير مكتملة (حالة/نقطة/مفتاح)");
  else ok("بطاقة الحالة تعرض الحالة ومفتاح التشغيل");

  const steps = d.querySelectorAll("#acctSteps .acct-step");
  if (steps.length !== 3) fail(`خطوات التشغيل: ${steps.length} بدل 3`);
  else ok("خطوات التشغيل الثلاث مرسومة");

  const kpis = d.querySelectorAll("#acctKpis .kpi");
  if (kpis.length !== 4) fail(`أرقام الأتمتة: ${kpis.length} بدل 4`);
  else ok("أرقام الأتمتة (منشور/طابور/فشل/آخر نشر) مرسومة");

  const ids = ["selContentMode", "acctReciter", "selBackground"];
  const missing = ids.filter((id) => !d.getElementById(id));
  if (missing.length) fail("عناصر التخصيص المفقودة: " + missing.join(", "));
  else ok("اختيار المحتوى والقارئ والخلفية موجودة (قابلة للتعديل)");

  const recOpts = [...d.querySelectorAll("#acctReciter option")].map((o) => o.value);
  if (recOpts[0] !== "" || recOpts.length < 2) fail("قائمة القُرّاء لا تبدأ بـ«تلقائي» أو فارغة: " + JSON.stringify(recOpts.slice(0, 3)));
  else ok("قائمة القُرّاء تتيح «تلقائي» وقارئًا محدّدًا");

  if (!/يوتيوب/.test((d.getElementById("acctAuto") || {}).textContent || "")) fail("اسم القناة/المنصة لم يظهر");
  else ok("اسم القناة المرتبطة ظهر");

  // ---- سطر «آخر تشغيل آلي»: الحالة والسبب واليوم، مع تهريب النص ----
  const dailyLine = d.getElementById("acctLastDaily");
  if (!dailyLine) fail("سطر «آخر تشغيل آلي» لم يظهر في اللوحة");
  else if (!/آخر تشغيل آلي \(2026-11-11\)/.test(dailyLine.textContent) || !/فشل/.test(dailyLine.textContent)) {
    fail("سطر آخر تشغيل آلي لا يذكر اليوم/الحالة: " + dailyLine.textContent.slice(0, 120));
  } else if (!/تحضير التلاوة/.test(dailyLine.textContent)) fail("سبب الفشل غير معروض في اللوحة");
  else if (dailyLine.querySelector("b")) fail("نص السبب لم يُهرَّب (وسم HTML نُفّذ)");
  else ok("سطر «آخر تشغيل آلي» يعرض اليوم والحالة والسبب مهروبًا");

  // ---- لا تكرار ولا فقدان لمعرّفات DOM بعد الرسم (رسم الحاوية داخل نفسها) ----
  const idList = ["acctQueue", "acctAuto", "queueList", "acctQuickActions", "acctPlatforms", "acctLastDaily"];
  const badIds = idList.filter((id) => d.querySelectorAll("#" + id).length !== 1);
  if (badIds.length) fail("معرّفات مفقودة/مكررة بعد الرسم: " + badIds.join(", "));
  else ok("معرّفات DOM فريدة بعد الرسم");

  // ---- المنصات: غير القابلة للنشر معطّلة ولا تُرسل مع الحفظ ----
  const disabled = [...d.querySelectorAll("#acctPlatforms input[data-platform]")].filter((i) => i.disabled).map((i) => i.dataset.platform);
  if (disabled.sort().join(",") !== "linkedin,telegram,whatsapp") fail("تعطيل المنصات غير المدعومة ناقص: " + disabled.join(","));
  else ok("المنصات غير المدعومة (linkedin/telegram/whatsapp) معطّلة في الواجهة");

  // حالة الربط ليست هي اختيار المستخدم للمنصات.
  window.PublishApp.renderPlatformChecks({ ...ACCOUNT, platforms: ["youtube", "facebook"], config: { ...ACCOUNT.config, platforms: ["youtube"] } });
  if (d.querySelector('#plat-facebook').checked || !d.querySelector('#plat-youtube').checked) fail("اختيار المنصات لا يعكس الإعداد المحفوظ");
  else ok("اختيار المنصات يعكس الإعداد المحفوظ لا مجرد الربط");
  window.PublishApp.renderHistory([{ status: "published", external_url: "javascript:alert(1)" }]);
  if (d.querySelector('#queueList a')) fail("رابط غير آمن في السجل");
  else ok("روابط السجل ترفض javascript:");
  window.PublishApp.renderHistory(ACCOUNT.runs);

  const saveBtn = d.getElementById("autoSave");
  if (saveBtn) {
    [...d.querySelectorAll("#acctPlatforms input[data-platform]")].forEach((i) => { if (!i.disabled) i.checked = true; });
    calls.length = 0; alerts.length = 0;
    saveBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));
    const sent = (() => { try { return JSON.parse(calls[0].body).platforms || []; } catch { return []; } })();
    if (sent.length !== 5 || sent.includes("linkedin") || sent.includes("whatsapp")) fail("الحفظ أرسل منصات غير مدعومة: " + JSON.stringify(sent));
    else ok("الحفظ يرسل المنصات المدعومة فقط (5)");
  }

  // ---- عدّاد المقالات الحقيقي بدل «10,000» ----
  const genBtn = d.getElementById("autoGenArticle") || d.getElementById("quickGenArticle");
  if (!genBtn || !/(500|٥٠٠)/.test(genBtn.textContent)) fail("نص زر المقال لا يعرض العدد الحقيقي: " + (genBtn && genBtn.textContent));
  else ok("نص زر «توليد من مقال» يعرض العدد من الخادم (500)");

  // ---- أزرار اللوحة: كل إجراء يجب أن يذهب إلى /api/autopilot بالاسم الصحيح ----
  const click = async (id) => {
    const el = d.getElementById(id);
    if (!el) return fail(`زر مفقود في index.html: #${id}`);
    calls.length = 0; alerts.length = 0;
    el.dispatchEvent(new window.Event("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));
    return calls.find((c) => c.method === "POST") || calls[0] || null;
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

  if (!["autoRunAll", "quickRunAll"].every(id => d.getElementById(id)?.textContent.includes("الإعدادات المحفوظة"))) fail("تسمية التشغيل الإضافي لا توضّح الإعدادات المحفوظة");
  else ok("التشغيل الإضافي يوضح أنه يستخدم الإعدادات المحفوظة");

  // النموذج السابق لم يكن يجدول فيديو؛ السجل محفوظ، والتحذيرات لا تُخفى داخل التشخيص.
  if (d.getElementById("schedSave") || d.getElementById("schedTitle")) fail("حقول الجدولة غير الفعالة ما زالت ظاهرة");
  else ok("لا تظهر حقول جدولة لا تنشئ طلبًا");
  if (d.getElementById("acctTools").tagName !== "DETAILS" || d.getElementById("acctTools").open) fail("التشخيص ليس مطويًا افتراضيًا");
  else ok("التشخيص مطوي ويمكن فتحه");
  const more = d.querySelector("#acctAuto .acct-more");
  calls.length = 0;
  if (!more || more.open || !more.querySelector("#autoRunAll") || !more.querySelector("#autoGenArticle")) fail("الخيارات الإضافية غير متاحة داخل قسم مطوي");
  else {
    more.querySelector("summary").click();
    await new Promise((r) => setTimeout(r, 0));
    if (!more.open || calls.length) fail("فتح الخيارات لم ينجح أو أرسل طلب شبكة");
    else ok("فتح الخيارات الإضافية لا يبدأ نشرًا");
  }
  window.PublishApp.renderAccount({ ...ACCOUNT, reauth: ["youtube"] });
  if (!d.querySelector("#acctAlerts #acctReauth") || d.querySelector("#acctTools #acctReauth")) fail("تحذير إعادة الربط ليس ظاهرًا خارج التشخيص");
  else ok("تحذير إعادة الربط ظاهر خارج التشخيص المطوي");
  window.PublishApp.renderAccount({ ...ACCOUNT });

  if (consoleErrors.length) fail("أخطاء console غير متوقعة: " + consoleErrors.slice(0, 3).join(" | "));
  else ok("لا أخطاء console");

  /* ---- تفاصيل آخر فشل توليد: تُعرض في اللوحة بدل أن تبقى في القاعدة ---- */
  window.PublishApp.renderAccount({ ...ACCOUNT });
  const check = d.getElementById("acctLastCheck");
  const diag = d.getElementById("acctDiag");
  if (!check || !/فاشل/.test(check.textContent)) fail("سطر آخر فحص محفوظ لا يبيّن الفشل");
  else if (!diag) fail("تفاصيل فشل التوليد غير معروضة في اللوحة");
  else {
    const txt = diag.textContent || "";
    const want = ["توقّف بلا تقدّم", "بدأ التصدير؟: لا", "الآيات المحددة: 0", "حدّد آية أولًا", "TypeError"];
    const missing = want.filter((w) => !txt.includes(w));
    if (missing.length) fail("تفاصيل التشخيص ناقصة: " + missing.join(", "));
    else if (diag.querySelector("b, i, script")) fail("تفاصيل التشخيص لم تُهرَّب (وسم من الخادم)");
    else ok("تفاصيل آخر فشل توليد تُعرض كاملة ومُهرَّبة");
  }
  // فحص فاشل بلا سبب مكتوب لكن التلاوة لم تصل ⇒ نسمّي السبب بدل «غير معروف»
  window.PublishApp.renderAccount({ ...ACCOUNT, last_check: { kind: "render_selftest_deep", ok: false, created_at: "2026-11-11T06:00:00Z", detail: { error: "", audio_direct: { ok: false, status: 0, error: "ENOTFOUND" }, audio_proxy: { ok: false } } } });
  const audioLine = d.getElementById("acctLastCheck");
  if (!audioLine || !/التلاوة غير متاحة من الخادم/.test(audioLine.textContent)) fail("فشل الصوت لا يُسمّى في سطر آخر فحص");
  else ok("فشل تحميل التلاوة يُسمّى صريحًا في اللوحة");

  // روابط العودة القديمة ليست إثباتًا للنشر؛ تطلب التحقق من السجل والقناة.
  window.history.replaceState(null, "", "/#/account?linked=youtube&auto_resume=published");
  window.PublishApp.reportLinkedFlag();
  if (!/رابط عودة قديم/.test(d.getElementById("acctNotice").textContent) || /نشر الفيديو الجاهز تلقائيًا/.test(d.getElementById("acctNotice").textContent)) fail("رابط العودة القديم يدّعي نشرًا غير متحقق");
  else ok("رابط النجاح القديم يطلب التحقق ولا يؤكد النشر");
  window.history.replaceState(null, "", "/#/account?linked=youtube&channel=nondefault");
  window.PublishApp.reportLinkedFlag();
  if (!/مش الافتراضية/.test(d.getElementById("acctNotice").textContent)) fail("لم يُشرح أن القناة المربوطة ليست الافتراضية");
  else ok("القناة غير الافتراضية يُشرح وضعها دون تعديل اختيار المستخدم");
  window.history.replaceState(null, "", "/#/account?linked=youtube&auto_resume=failed");
  window.PublishApp.reportLinkedFlag();
  if (!/رابط عودة قديم/.test(d.getElementById("acctNotice").textContent)) fail("رابط الفشل القديم لا يطلب التحقق");
  else ok("رابط الفشل القديم يطلب التحقق من السجل والقناة");

  // صفّ قديم يحمل invalid_grant بلا حقل reauth ⇒ يُترجم ويظهر الزر
  window.PublishApp.renderAccount({ ...ACCOUNT, reauth: undefined, last_daily: { run_date: "2026-11-12", status: "failed", error: "فشل في 1 منصات: youtube: تجديد التوكن فشل (youtube): invalid_grant", external_url: null } });
  const legacy = d.getElementById("acctReauth");
  const legacyDaily = d.getElementById("acctLastDaily");
  if (!legacy || !/إعادة الربط/.test(legacy.textContent)) fail("صفّ invalid_grant القديم لا يُظهر تنبيه إعادة الربط");
  else if (!d.getElementById("btnRetryPublish")) fail("صفّ invalid_grant القديم لا يُظهر زر النشر الجاهز");
  else if (!legacyDaily || /invalid_grant/.test(legacyDaily.textContent)) fail("نص الخطأ الخام invalid_grant لا يزال معروضًا");
  else ok("صفّ invalid_grant القديم يُترجم ويُظهر زر النشر الجاهز");

  window.PublishApp.renderAccount({ ...ACCOUNT, reauth: [], last_daily: { run_date: "2026-11-12", status: "failed", error: "invalid_grant" } });
  if (d.getElementById("acctReauth")) fail("خطأ قديم أعاد التحذير بعد إعادة الربط");
  else if (!d.getElementById("btnRetryPublish")) fail("زر نشر الفيديو الجاهز اختفى بعد إعادة الربط");
  else ok("بعد إعادة الربط لا يظهر تحذير قديم ويبقى زر نشر الفيديو الجاهز");

  // ربط منتهٍ: تنبيه صريح يقول ماذا يفعل المستخدم (وأن الفيديو الجاهز سيُنشر)
  window.PublishApp.renderAccount({ ...ACCOUNT, reauth: ["youtube"] });
  const re = d.getElementById("acctReauth");
  if (!re) fail("لا تنبيه عند انتهاء ربط القناة (invalid_grant)");
  else if (!/إعادة الربط/.test(re.textContent) || !/لا تُعاد المحاولات الفاشلة تلقائيًا/.test(re.textContent)) fail("تنبيه انتهاء الربط لا يوضح ضرورة المراجعة");
  else ok("تنبيه انتهاء الربط يشرح ضرورة مراجعة الفيديو قبل إعادة النشر");
  // زر «انشر الفيديو الجاهز» يرسل الإجراء الصحيح
  const retryBtn = d.getElementById("btnRetryPublish");
  if (!retryBtn) fail("لا زر نشر للفيديو الجاهز مع ربط منتهٍ");
  else {
    calls.length = 0;
    retryBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 40));
    const sent = calls.find((c) => /\/api\/autopilot/.test(String(c.url || "")));
    let body = null;
    try { body = sent && JSON.parse(sent.body); } catch { body = null; }
    if (!body || body.action !== "retry_publish") fail("زر النشر الجاهز لا يرسل retry_publish: " + JSON.stringify(body));
    else ok("زر «انشر الفيديو الجاهز» يرسل retry_publish");
  }
  window.PublishApp.renderAccount({ ...ACCOUNT, reauth: [] });
  if (d.getElementById("acctReauth")) fail("تنبيه انتهاء الربط يظهر بلا سبب");
  else ok("لا تنبيه انتهاء ربط عند سلامة القنوات");
  window.PublishApp.renderAccount({ ...ACCOUNT, reauth: ["<b>x"] });
  const reEsc = d.getElementById("acctReauth");
  if (reEsc && reEsc.querySelector("b")) fail("تنبيه انتهاء الربط لم يُهرَّب");
  else ok("تنبيه انتهاء الربط مُهرَّب");

  // بلا فشل توليد: لا صندوق تفاصيل فارغ
  window.PublishApp.renderAccount({ ...ACCOUNT, last_check: { kind: "render_selftest_deep", ok: true, created_at: "2026-11-11T05:00:00Z", detail: {} } });
  if (d.getElementById("acctDiag")) fail("صندوق تفاصيل يظهر مع فحص ناجح");
  else ok("لا صندوق تفاصيل مع فحص ناجح");

  // ---- سطر التشغيل الآلي: حالة «منشور» + الرابط (آخر خطوة حتى لا تُفقد مستمعات الحفظ) ----
  window.PublishApp.renderAccount({ ...ACCOUNT, last_daily: { run_date: "2026-11-11", status: "published", external_url: "https://youtu.be/ok" } });
  const dailyOk = d.getElementById("acctLastDaily");
  if (!dailyOk || !/منشور/.test(dailyOk.textContent)) fail("حالة «منشور» لا تظهر في سطر التشغيل الآلي");
  else if (!dailyOk.querySelector('a[href="https://youtu.be/ok"]')) fail("رابط المنشور غير معروض");
  else ok("سطر التشغيل الآلي يعرض «منشور» + رابط المنشور");

  // عند قناتين يصف التلميح الاختيار المحفوظ، ولا يبدّله فتح اللوحة.
  window.fetch = async () => ({ ok: true, json: async () => ({ connections: [
    { id: "a", platform: "youtube", account_name: "قناة أ", is_default: true, has_refresh: true },
    { id: "b", platform: "youtube", account_name: "قناة ب", is_default: false, has_refresh: true },
  ] }) });
  window.PublishApp.renderAccount({ ...ACCOUNT, config: { ...ACCOUNT.config, all_channels: true } });
  await window.PublishApp.renderConnections("test-token");
  if (d.querySelectorAll('#acctAccountsList [data-channel]').length !== 2 || !/التخطيط لكل القنوات المرتبطة/.test(d.getElementById("acctAccountsList").textContent) || !d.getElementById("chkAllChannels").checked) fail("وضع القناتين لا يعكس اختيار كل القنوات");
  else ok("القناتان وتلميح كل القنوات والمفتاح تظهر حسب الإعداد المحفوظ");
  window.PublishApp.renderAccount({ ...ACCOUNT, config: { ...ACCOUNT.config, all_channels: false } });
  await window.PublishApp.renderConnections("test-token");
  if (!/مهمة جديدة لكل منصة دون تثبيت قناة/.test(d.getElementById("acctAccountsList").textContent) || !/أحدث اتصال إذا غابت/.test(d.getElementById("acctAccountsList").textContent) || d.getElementById("chkAllChannels").checked) fail("وضع القناة الواحدة لا يعكس الإعداد واختيار وقت التنفيذ");
  else ok("تلميح القناة الواحدة يشرح الاختيار المتأخر والبديل");

  const targetRows = async (rows, config = ACCOUNT.config) => {
    window.fetch = async () => ({ ok: true, json: async () => ({ connections: rows }) });
    window.PublishApp.renderAccount({ ...ACCOUNT, config });
    await window.PublishApp.renderConnections("test-token");
    return d.querySelector('.chan-group[data-soc="youtube"]').textContent;
  };
  const a = { id: "a", platform: "youtube", account_name: "قناة أ", has_refresh: true };
  const b = { id: "b", platform: "youtube", account_name: "قناة ب", has_refresh: true };
  let text = await targetRows([{ ...a, is_default: false }, { ...b, is_default: false }]);
  if (!/لا تظهر قناة افتراضية/.test(text) || !/قد تتغير الوجهة/.test(text) || !/راجع القناة الافتراضية/.test(d.getElementById("acctStateLabel").textContent)) fail("غياب الافتراضية لا يحذر من الوجهة");
  else ok("غياب الافتراضية يحذر دون تحديد قناة بعينها");
  text = await targetRows([{ ...a, is_default: true }, { ...b, is_default: false }]);
  if (!/تظهر قناة افتراضية واحدة/.test(text) || !/غير المحفوظة/.test(text) || /راجع القناة الافتراضية/.test(d.getElementById("acctStateLabel").textContent)) fail("الافتراضية الواحدة أو الفرق بين المسودة والخادم غير واضح");
  else ok("افتراضية واحدة في لقطة الخادم مع فصل المسودة");
  d.getElementById("chkAllChannels").checked = true;
  await window.PublishApp.renderConnections("test-token");
  if (!/مهمة جديدة لكل منصة دون تثبيت قناة/.test(d.getElementById("acctAccountsList").textContent)) fail("تعديل المسودة غير المحفوظ غيّر وصف إعداد الخادم");
  else ok("تعديل المسودة لا يغيّر وصف إعداد الخادم");
  text = await targetRows([{ ...a, is_default: true }, { ...b, is_default: true }]);
  if (!/أكثر من قناة افتراضية/.test(text) || !/راجع القناة الافتراضية/.test(d.getElementById("acctStateLabel").textContent)) fail("الافتراضيات المتعددة لم تعرض التحذير");
  else ok("الافتراضيات المتعددة لا تحدد وجهة");
  text = await targetRows([{ ...a, is_default: true }, b]);
  if (!/حالة الافتراضية في القائمة غير معروفة/.test(text) || !/حالة الافتراضية غير معروفة/.test(d.querySelector('[data-channel="b"]').textContent)) fail("بيانات افتراضية ناقصة عوملت كأنها لا");
  else ok("قيمة افتراضية ناقصة تُعرض كمجهولة");
  text = await targetRows([{ ...a, is_default: false }]);
  if (!/لا تظهر قناة افتراضية/.test(text) || !/أحدث اتصال إذا غابت/.test(text)) fail("القناة الوحيدة بلا افتراضية لا توضح البديل");
  else ok("قناة وحيدة بلا افتراضية لا تخفي البديل");
  text = await targetRows([{ ...a, is_default: false }, { ...b, is_default: false }], { ...ACCOUNT.config, all_channels: true });
  if (!/التخطيط لكل القنوات المرتبطة/.test(text) || /راجع القناة الافتراضية/.test(d.getElementById("acctStateLabel").textContent)) fail("وضع كل القنوات لا يعكس التخطيط المحفوظ");
  else ok("وضع كل القنوات يختلف عن اختيار قناة واحدة");
  text = await targetRows([{ ...a, is_default: true }], { ...ACCOUNT.config, all_channels: undefined });
  if (!/إعداد النشر على كل القنوات غير معروف/.test(text) || !/إعداد القنوات غير واضح/.test(d.getElementById("acctStateLabel").textContent)) fail("إعداد مجهول عومل كاختيار محفوظ");
  else ok("الإعداد غير المعروف لا يعرض كاختيار محفوظ");
  await targetRows([{ ...a, is_default: true }, { ...b, is_default: false }]);

  // القنوات المختارة أو التي تحتاج ربطًا لا تُدفن داخل قائمة المنصات الأخرى.
  const groups = d.getElementById("acctAccountsList");
  let morePlatforms = d.getElementById("acctMorePlatforms");
  if (!morePlatforms || morePlatforms.open || morePlatforms.querySelector('[data-channel]') || !morePlatforms.querySelector('[data-connect="facebook"]')) fail("القنوات الأخرى ليست مجمّعة أو أخفت القنوات المرتبطة");
  else ok("القنوات المرتبطة ظاهرة والمنصات الأخرى متاحة بقسم مطوي");
  morePlatforms.open = true;
  await window.PublishApp.renderConnections("test-token");
  if (!d.getElementById("acctMorePlatforms").open) fail("تحديث القنوات أغلق القسم الذي فتحه المستخدم");
  else ok("تحديث القنوات يحافظ على فتح قسم المنصات الأخرى");
  window.PublishApp.renderAccount({ ...ACCOUNT, config: { ...ACCOUNT.config, platforms: ["youtube", "facebook"] } });
  await window.PublishApp.renderConnections("test-token");
  const fbGroup = groups.querySelector('.chan-group[data-soc="facebook"]');
  if (!fbGroup || fbGroup.closest('#acctMorePlatforms') || !/مختارة للنشر/.test(fbGroup.textContent)) fail("منصة مختارة غير مرتبطة لم تظهر مع تحذير");
  else ok("المنصة المختارة بلا ربط تبقى ظاهرة مع تحذير");
  window.PublishApp.renderAccount({ ...ACCOUNT, reauth: ["youtube"] });
  await window.PublishApp.renderConnections("test-token");
  const warningChannel = groups.querySelector('[data-channel="a"]');
  const ytGroup = groups.querySelector('.chan-group[data-soc="youtube"]');
  if (!warningChannel || warningChannel.closest('#acctMorePlatforms') || !/فشل تجديد سابق لهذه المنصة/.test(ytGroup.textContent) || !/لا يحدد القناة/.test(ytGroup.textContent) || /انتهت صلاحية الربط/.test(warningChannel.textContent)) fail("تحذير المنصة لم يبق ظاهرًا أو نُسب خطأً لقناة محددة");
  else ok("تحذير المنصة يظل ظاهرًا دون الجزم بقناة محددة");
  window.fetch = async () => ({ ok: true, json: async () => ({ connections: [] }) });
  window.PublishApp.renderAccount({ ...ACCOUNT, config: { ...ACCOUNT.config, platforms: [] } });
  await window.PublishApp.renderConnections("test-token");
  if (!groups.querySelector('[data-connect="youtube"]') || groups.querySelector('[data-connect="youtube"]').closest('#acctMorePlatforms')) fail("المستخدم الجديد لا يرى زر ربط يوتيوب مباشرة");
  else ok("المستخدم بلا قنوات يرى خيارات الربط المتاحة مباشرة");
  // حالة مستقلة بعد انتهاء المسودة السابقة: الإيقاف يحفظ قائمة منصات فارغة.
  window.PublishApp._autoDirty = false;
  window.PublishApp.renderAccount({ ...ACCOUNT, config: { ...ACCOUNT.config, enabled: false, platforms: [], all_channels: true } });
  let savedEmpty = null;
  window.fetch = async (url, opts = {}) => {
    savedEmpty = JSON.parse(opts.body);
    return { ok: true, status: 200, json: async () => ({ ok: true, config: { ...savedEmpty, settings_revision: "33333333-3333-4333-8333-333333333333" } }) };
  };
  const emptyResult = await window.PublishApp.saveSettings({ enabled: false });
  if (!emptyResult.ok || savedEmpty.enabled !== false || savedEmpty.platforms.length !== 0 || savedEmpty.all_channels !== true || window.PublishApp.data.config.platforms.length !== 0) fail("حفظ الإيقاف غيّر اختيار المنصات الفارغ");
  else ok("حفظ الإيقاف يحافظ على القائمة الفارغة وخيار كل القنوات");
  window.fetch = async () => { throw Error("offline"); };
  await window.PublishApp.renderConnections("test-token");
  if (!/تعذّر تحميل الحسابات/.test(groups.textContent)) fail("فشل قراءة القنوات لا يظهر");
  else ok("فشل تحميل القنوات يُعرض بوضوح");

  done();
})();

function done() {
  console.log(errs.length ? `ERRORS ${errs.length}` : "ALL OK (0 errors)");

  if (errs.length) console.log(errs.map((e) => " - " + e).join("\n"));
  process.exit(errs.length ? 1 : 0);
}

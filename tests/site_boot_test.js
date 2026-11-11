#!/usr/bin/env node
/* ============================================================
 * اختبار إقلاع الموقع (jsdom) — هل الصفحة تعمل فعلًا في المتصفح؟
 * ------------------------------------------------------------
 * لماذا هذا الملف؟ «الموقع مش شغال» لم يكن عطلًا واحدًا: بعد استعادة الصفحة
 * الرئيسية بقيت عناصر حذفها الدمج (الفوتر و#year وشريط الكوكيز)، فكان أول سطر في
 * app.js يرمي `Cannot set properties of null` **قبل** تشغيل الراوتر وتهيئة الصانع،
 * فتظهر الصفحة بلا أدوات وبلا إنشاء. ولا اختبار سابق كان يحمّل السكربتات معًا.
 *
 * يُحمّل هنا index.html + السكربتات التسعة في سياق واحد (كما يفعل المتصفح)،
 * بمصادر محلية حقيقية (data/*.json)، ويتحقق من:
 *   1) لا استثناءات غير مُلتقطة عند الإقلاع.
 *   2) الصانع جاهز: قائمة السور 114 خيارًا (بيانات القرآن حُمّلت).
 *   3) العرض الرئيسي ظاهر، والراوتر يعمل (تغيير الهاش يبدّل العرض).
 *   4) عناصر الإقلاع الاختيارية موجودة: #year (السنة) و#cookieBar.
 *   5) واجهة الدخول موجودة (#authBtn + #loginOverlay).
 *
 * التشغيل: NODE_PATH=<jsdom> node tests/site_boot_test.js
 * (يُشغَّل تلقائيًا في pretest إن كان jsdom متاحًا، وإلا يُتخطّى بتنبيه)
 * ============================================================ */
const fs = require("fs");
const path = require("path");

let JSDOM;
try { ({ JSDOM } = require("jsdom")); }
catch {
  console.log("WARN تخطّي اختبار الإقلاع: jsdom غير مثبّت (npm i --no-save jsdom)");
  process.exit(0);
}

const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const html = fs.readFileSync(path.join(PUBLIC, "index.html"), "utf8");

let pass = 0;
const errs = [];
const ok = (m) => { pass++; console.log("OK   " + m); };
const fail = (m) => { errs.push(m); console.log("FAIL " + m); };
const chk = (n, c, x = "") => (c ? ok(n) : fail(n + (x ? " :: " + x : "")));

const dom = new JSDOM(html, { url: "https://quran-reels-tau.vercel.app/", runScripts: "outside-only", pretendToBeVisual: true });
const w = dom.window;
const d = w.document;

/* بيئة متصفح مبسّطة: لا شبكة، والملفات تُقرأ من public/ */
const bootErrors = [];
w.addEventListener("error", (e) => bootErrors.push(String(e.message || e.error)));
w.scrollTo = () => {};
w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} }));
w.fetch = async (u) => {
  const p = String(u).replace(/^https?:\/\/[^/]+/, "").split("?")[0];
  const file = path.join(PUBLIC, p.replace(/^\//, ""));
  if (p.includes("/api/")) {
    return { ok: true, status: 200, json: async () => ({ supabase: { url: "", anon: "" }, config: {}, runs: [], platforms: [], connected: false, available: [], articles: { count: 500 } }) };
  }
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    const txt = fs.readFileSync(file, "utf8");
    return { ok: true, status: 200, text: async () => txt, json: async () => JSON.parse(txt) };
  }
  return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
};
w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => ({}), set: () => true });
w.MediaRecorder = class { static isTypeSupported() { return true; } start() {} stop() {} };
w.Audio = class { play() {} pause() {} addEventListener() {} };
w.HTMLMediaElement.prototype.play = async () => {};
w.alert = () => {};
w.confirm = () => false;

/* تحميل السكربتات كما في الصفحة، بترتيبها، في سياق واحد */
const scripts = [...html.matchAll(/<script src="js\/([^"?]+)\?[^"]*" defer><\/script>/g)].map((m) => m[1]);
const bundle = scripts.map((f) => `/* ==== ${f} ==== */\n` + fs.readFileSync(path.join(PUBLIC, "js", f), "utf8")).join("\n;\n");
let loadError = null;
try { w.eval(bundle); } catch (e) { loadError = e; }

d.dispatchEvent(new w.Event("DOMContentLoaded"));

setTimeout(async () => {
  chk(`كل سكربتات الصفحة محمّلة (${scripts.length})`, scripts.length >= 9 && !loadError, loadError ? String(loadError.message) : scripts.join(","));
  chk("لا استثناءات غير مُلتقطة عند الإقلاع", bootErrors.length === 0, bootErrors.join(" | "));

  const home = d.getElementById("view-home");
  chk("العرض الرئيسي ظاهر بعد الإقلاع", home && home.hidden === false);

  const surah = d.getElementById("selSurah");
  chk("بيانات القرآن حُمّلت (114 سورة في القائمة)", surah && surah.options.length === 114, surah ? `${surah.options.length} خيارًا` : "لا يوجد #selSurah");

  const reciter = d.getElementById("selReciter");
  chk("قائمة القرّاء مملوءة", reciter && reciter.options.length > 10, reciter ? `${reciter.options.length}` : "لا يوجد #selReciter");

  chk("السنة في الفوتر تُملأ (#year)", /^\d{4}$/.test((d.getElementById("year")?.textContent || "").trim()), d.getElementById("year")?.textContent);
  chk("شريط الكوكيز موجود", Boolean(d.getElementById("cookieBar") && d.getElementById("cookieOk")));
  chk("زر الدخول ونافذته موجودان", Boolean(d.getElementById("authBtn") && d.getElementById("loginOverlay")));

  /* سبب عدم بدء التصدير يُسجَّل داخل الصفحة (كان السجل يقول «غير معروف» فقط).
   * Creator/Selection معرّفان كـ const داخل باقة السكربتات، فلا وجود لـwindow.Creator
   * — نقرأهما عبر eval في نفس السياق. */
  const Creator = w.Creator;
  const Selection = w.Selection;
  chk("Creator.lastAbortReason موجود", Boolean(Creator && typeof Creator.lastAbortReason === "string"));
  let abortOk = false;
  try {
    const saved = { from: Selection.from, to: Selection.to };
    Selection.to = Selection.from - 1; // عدّاد صفر
    await Creator.startExport();
    abortOk = /لم تُحدَّد آيات/.test(String(Creator.lastAbortReason || ""));
    Selection.from = saved.from; Selection.to = saved.to;
  } catch { abortOk = false; }
  chk("startExport يسجّل سبب الرفض عند غياب الآيات", abortOk, String(Creator && Creator.lastAbortReason));

  /* الراوتر: تغيير الهاش يجب أن يبدّل العرض */
  w.location.hash = "#/tools";
  w.dispatchEvent(new w.Event("hashchange"));
  setTimeout(() => {
    chk("الراوتر يعمل: #/tools يظهر صفحة الأدوات", d.getElementById("view-tools").hidden === false && home.hidden === true);
    chk("لا استثناءات بعد التنقّل", bootErrors.length === 0, bootErrors.join(" | "));
    console.log(errs.length ? `ERRORS ${errs.length}` : `ALL OK (${pass} checks)`);
    if (errs.length) console.log(errs.map((e) => " - " + e).join("\n"));
    process.exit(errs.length ? 1 : 0);
  }, 120);
}, 900);

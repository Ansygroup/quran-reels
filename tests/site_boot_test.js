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

  // كل التبويبات ما زالت تعمل بعد ترتيب الصانع، مع الاحتفاظ باختيار السورة.
  const tabs = [...d.querySelectorAll("#stepTabs .step-tab")];
  const beforeSurah = surah.value;
  const tabResults = tabs.map((tab) => {
    tab.click();
    const pane = d.getElementById("pane-" + tab.dataset.pane);
    return Boolean(pane && pane.classList.contains("active") && tab.classList.contains("active") && d.querySelectorAll(".step-pane.active").length === 1);
  });
  chk("تبويبات الصانع السبعة تعمل دون تغيير السورة", tabs.length === 7 && tabResults.every(Boolean) && surah.value === beforeSurah);
  tabs[0]?.click();
  chk("المعاينة وأزرارها وزر الإنشاء متاحة", ["reelCanvas", "btnPlay", "btnPrevAyah", "btnNextAyah", "btnCreate"].every((id) => Boolean(d.getElementById(id))));
  chk("الصفحة لا تعرض مقارنة سرعة غير مثبتة", !d.querySelector("#view-home .hero").textContent.includes("أسرع بـ١٠"));

  // الصفحة تختصر الأدوات المختارة، لكن رابط جميع الأدوات والمكتبة يظل صالحًا.
  const featuredTools = [...d.querySelectorAll("#homeTools .tool-card")];
  chk("الرئيسية تعرض ست أدوات مختارة", featuredTools.length === 6 && featuredTools.some(a => a.getAttribute("href") === "#/tool/zakat"));
  chk("رابط كل الأدوات ظاهر", Boolean(d.querySelector('#tools a[href="#/tools"]')));
  chk("المكتبة لها رابط فعلي واحد دون تصنيفات وهمية", d.querySelectorAll("#library a").length === 1 && d.querySelector("#library a").getAttribute("href") === "/articles/" && fs.existsSync(path.join(PUBLIC, "articles/index.html")));
  chk("الخطوات والأسئلة محفوظة", d.querySelectorAll("#steps .step-card").length === 4 && d.querySelectorAll("#faq .faq-item").length >= 10);

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
  setTimeout(async () => {
    chk("الراوتر يعمل: #/tools يظهر صفحة الأدوات", d.getElementById("view-tools").hidden === false && home.hidden === true);
    chk("صفحة جميع الأدوات ما زالت تعرض القائمة الكاملة", d.querySelectorAll("#toolsGridAll .tool-card").length >= 32);
    const fullCount = d.querySelectorAll("#toolsGridAll .tool-card").length;
    const search = d.getElementById("toolsSearch"), clear = d.getElementById("toolsClear");
    const find = async (text) => { search.value = text; search.dispatchEvent(new w.Event("input", { bubbles: true })); await new Promise(r => setTimeout(r, 210)); };
    await find("أذكار");
    chk("بحث الأدوات يطبّع الهمزات ويعرض النتائج", d.querySelectorAll("#toolsGridAll .tool-card").length > 0 && !clear.hidden && /من/.test(d.getElementById("toolsResults").textContent));
    await find("baby-names");
    chk("بحث المعرّف المركب يعمل", d.querySelectorAll("#toolsGridAll .tool-card").length === 1 && d.querySelector('#toolsGridAll a[href="#/tool/baby-names"]'));
    await find("لا يوجد اسم بهذا الشكل مطلقا");
    chk("عدم وجود نتيجة ظاهر بجانب القائمة", !d.getElementById("toolsEmpty").hidden && d.querySelectorAll("#toolsGridAll .tool-card").length === 0);
    clear.click();
    await new Promise(r => setTimeout(r, 210));
    chk("مسح البحث يعيد القائمة ويركز على الحقل", search.value === "" && clear.hidden && d.activeElement === search && d.getElementById("toolsEmpty").hidden && d.querySelectorAll("#toolsGridAll .tool-card").length === fullCount);
    // نختبر المسح قبل انقضاء مهلة البحث حتى لا تعود النتائج القديمة متأخرة.
    await find("أذكار");
    search.value = "baby-names";
    search.dispatchEvent(new w.Event("input", { bubbles: true }));
    clear.click();
    await new Promise(r => setTimeout(r, 210));
    chk("المسح السريع يلغي نتائج البحث المؤجل", search.value === "" && d.querySelectorAll("#toolsGridAll .tool-card").length === fullCount && clear.hidden);

    chk("لا استثناءات بعد التنقّل", bootErrors.length === 0, bootErrors.join(" | "));
    console.log(errs.length ? `ERRORS ${errs.length}` : `ALL OK (${pass} checks)`);
    if (errs.length) console.log(errs.map((e) => " - " + e).join("\n"));
    process.exit(errs.length ? 1 : 0);
  }, 120);
}, 900);

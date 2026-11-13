#!/usr/bin/env node
/* ============================================================
 * حاجز الصفحة الرئيسية — الموقع يجب أن يظل موقعًا، لا صفحة حساب.
 * ------------------------------------------------------------
 * لماذا هذا الملف؟ في 2026-11-07 وصل إلى main (عبر PR #2/#3) ملف
 * public/index.html بحجم 123 سطرًا: صفحة «حسابي» فقط، بلا صانع الريلز
 * (لا selSurah ولا Creator)، وبلا سكربتات data/core/quran/reel، ومعها
 * public/css/style.css مُختصر إلى 55 سطرًا (بقيت .tool-card و.article-card فقط).
 * النتيجة على الإنتاج: الجذر / يعرض صفحة حساب بلا تنسيق، وكل صفحات /articles/
 * و/ar/ تفقد التنسيق، وخط الأتمتة الذي يفتح /?s=108&from=1&to=3 وينتظر
 * Creator لا يستطيع توليد أي فيديو.
 *
 * الاختبار يثبت أن الصفحة الرئيسية كاملة (كل العروض + الصانع + السكربتات + CSS)،
 * وأن صفحة الحساب مدمجة داخلها بعناصرها التي يربطها public/js/publish.js،
 * وأن CSS ليس هيكلًا فارغًا، وأن المعرّفات فريدة.
 *
 * التشغيل: node tests/homepage_test.js   (ويُشغَّل تلقائيًا قبل npm test)
 * ============================================================ */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "public", "css", "style.css"), "utf8");
const publish = fs.readFileSync(path.join(ROOT, "public", "js", "publish.js"), "utf8");

let pass = 0;
const errs = [];
const ok = (m) => { pass++; console.log("OK   " + m); };
const fail = (m) => { errs.push(m); console.log("FAIL " + m); };
const chk = (name, cond, extra = "") => (cond ? ok(name) : fail(name + (extra ? " :: " + extra : "")));

/* 1) العروض الخمسة موجودة كعناصر .view */
const views = ["view-home", "view-tools", "view-tool", "view-privacy", "view-account"];
const missingViews = views.filter((id) => !new RegExp(`class="view[^"]*"[^>]*id="${id}"|id="${id}"[^>]*class="view`).test(html));
chk(`العروض الخمسة موجودة (${views.length})`, missingViews.length === 0, "ناقص: " + missingViews.join(", "));

/* 2) صانع الريلز: نص السورة + القارئ + السكربتات الأساسية */
const makerIds = ["selSurah", "selReciter", "btnCreate"];
const missingMaker = makerIds.filter((id) => !new RegExp(`id="${id}"`).test(html));
chk("واجهة الصانع موجودة في الصفحة الرئيسية", missingMaker.length === 0, "ناقص: " + missingMaker.join(", "));

const scripts = ["data.js", "core.js", "quran.js", "reel.js", "creator.js", "tools.js", "auth.js", "publish.js", "app.js"];
const missingScripts = scripts.filter((s) => !new RegExp(`src="js/${s.replace(".", "\\.")}\\?v=`).test(html));
chk(`سكربتات الواجهة التسعة محمّلة (${scripts.length})`, missingScripts.length === 0, "ناقص: " + missingScripts.join(", "));

/* 3) صفحة الحساب مدمجة: الحاويات التي يكتب فيها publish.js */
const acctIds = ["acctQuickActions", "acctPlatforms", "acctQueue", "queueList", "acctAuto", "acctAlerts", "acctAuth", "acctNotice"];
const missingAcct = acctIds.filter((id) => !new RegExp(`id="${id}"`).test(html));
chk("حاويات لوحة الحساب التي يربطها publish.js موجودة", missingAcct.length === 0, "ناقص: " + missingAcct.join(", "));

/* 4) كل معرّف يقرأه publish.js من الصفحة موجود فعلًا
 * نستثني ما ينشئه publish.js بنفسه داخل قوالب innerHTML (autoSave/autoRun/…)
 * وما يُقرأ باختيارية `?.` (selBackground/selContentMode — لها قيم افتراضية). */
const createdByJs = new Set([...publish.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const required = [...new Set([...publish.matchAll(/getElementById\("([^"]+)"\)(\??\.)/g)]
  .filter((m) => !createdByJs.has(m[1]) && m[2] !== "?.")
  .map((m) => m[1]))];
const absent = required.filter((id) => !new RegExp(`id="${id}"`).test(html));
chk(`كل المعرّفات التي يقرأها publish.js من الصفحة (${required.length}) موجودة`, absent.length === 0, "غائب: " + absent.join(", "));

/* 5) لا معرّفات مكرّرة (عطل #schedPlatforms المتكرّر) */
const allIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const dupes = [...new Set(allIds.filter((id, i) => allIds.indexOf(id) !== i))];
chk("كل المعرّفات في index.html فريدة", dupes.length === 0, "مكرّر: " + dupes.join(", "));

/* 6) CSS حقيقي لا هيكل فارغ */
const cssLines = css.split("\n").filter((l) => l.trim()).length;
chk("style.css ليس مختصرًا (≥ 400 سطر فعلي)", cssLines >= 400, `${cssLines} سطرًا`);
const coreClasses = [".btn", ".card", ".container", ".site-header", ".section-head", ".eyebrow", ".hint"];
const missingCss = coreClasses.filter((c) => !new RegExp(`\\${c}[ ,{:]`).test(css));
chk("أصناف التصميم الأساسية معرّفة في CSS", missingCss.length === 0, "ناقص: " + missingCss.join(", "));
chk("الصفحة تربط style.css", /href="\/?css\/style\.css\?v=\d+"/.test(html));

/* 7) العنوان عنوان الموقع لا عنوان صفحة الحساب */
const title = (html.match(/<title>([^<]*)<\/title>/) || [, ""])[1];
chkVTitle();
function chkVTitle() {
  chk("عنوان الصفحة الرئيسية عنوان الموقع (لا «حسابي» فقط)", /قرآن ريلز/.test(title) && !/^حسابي/.test(title.trim()), title);
}

console.log(errs.length ? `ERRORS ${errs.length}` : `ALL OK (${pass} checks)`);
if (errs.length) console.log(errs.map((e) => " - " + e).join("\n"));
process.exit(errs.length ? 1 : 0);

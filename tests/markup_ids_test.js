#!/usr/bin/env node
/* ============================================================
 * اختبار المعرّفات (G29) — الماركب لا يفقد عناصر الكود يعتمد عليها
 * ------------------------------------------------------------
 * العطل الذي أوقف كل عمليات التوليد (2026-11-04 → 2026-11-11):
 *   creator.js يفتح #exportOverlay أول شيء في startExport، والكتلة كانت
 *   مفقودة من index.html، فيرمي «Cannot set properties of null» ويبقى
 *   exporting=true بلا أي تقدّم — 0% إلى الأبد بلا سبب ظاهر.
 * هذا الاختبار يمنع تكراره: كل معرّف ثابت يستخدمه creator.js يجب أن يكون
 * في الصفحة، مع عناصر نافذة التصدير ونتيجتها.
 *
 * التشغيل: node tests/markup_ids_test.js
 * ============================================================ */
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
let pass = 0;
const errs = [];
const ok = (m) => { pass++; console.log("OK   " + m); };
const fail = (m) => { errs.push(m); console.log("FAIL " + m); };
const chk = (name, cond, extra = "") => (cond ? ok(name) : fail(name + (extra ? " :: " + extra : "")));

const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
const creator = fs.readFileSync(path.join(ROOT, "public", "js", "creator.js"), "utf8");
const htmlIds = new Set([...html.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map((m) => m[1]));
const usedIds = new Set([
  ...[...creator.matchAll(/\$\(\s*"#([A-Za-z0-9_-]+)"\s*\)/g)].map((m) => m[1]),
  ...[...creator.matchAll(/getElementById\(\s*"([A-Za-z0-9_-]+)"\s*\)/g)].map((m) => m[1]),
]);

const missing = [...usedIds].filter((id) => !htmlIds.has(id)).sort();
chk("كل معرّف ثابت في creator.js موجود في index.html", missing.length === 0, "مفقود: " + missing.join(", "));
chk("عدد المعرّفات المفحوصة معتبر (> 40)", usedIds.size > 40, String(usedIds.size));

/* نافذة التصدير وكل أجزائها */
const REQUIRED = [
  "exportOverlay", "expRunning", "expResult", "expPct", "expBar", "expStage", "expSub",
  "miniCanvas", "resultVideo", "resultMeta", "btnDownload", "btnShare", "btnSchedule",
  "btnNew", "btnCancelExport", "chkNotify",
];
const lost = REQUIRED.filter((id) => !htmlIds.has(id));
chk("نافذة التصدير كاملة (16 معرّفًا)", lost.length === 0, "مفقود: " + lost.join(", "));

/* سلوك آمن عند غياب النافذة مستقبلًا */
chk("startExport يحمي ضد غياب #exportOverlay",
  /if \(!ov\) \{/.test(creator) && /lastAbortReason = "نافذة التصدير/.test(creator) && /this\.exporting = false;/.test(creator));

/* نتائج التصدير تُعرض في #expResult لا في نافذة أخرى */
chk("_onExportDone يفتح #expResult ويغلق #expRunning",
  /\$\("#expRunning"\)\.hidden = true/.test(creator) && /\$\("#expResult"\)\.hidden = false/.test(creator));

/* حوارات .overlay ما زالت متوافقة مع مراقب الحوارات في lib/autopilot */
const core = fs.readFileSync(path.join(ROOT, "public", "js", "core.js"), "utf8");
chk("confirmDialog يستخدم .overlay + [data-ok] (مطابق لمراقب التشغيل الآلي)",
  /class: "overlay"/.test(core) && /data-ok/.test(core));
chk("نافذة التصدير لا تُشبه حوارًا (بلا data-ok) — لا يخبطها مراقب الحوارات",
  !/id="exportOverlay"[\s\S]{0,2000}data-ok/.test(html));

/* الكاش يكسر الملفات المتغيرة */
chk("creator.js?v=15 في الماركب", /creator\.js\?v=15/.test(html));
chk("sw مرفوع الإصدار (qr-v85)", /qr-v85/.test(fs.readFileSync(path.join(ROOT, "public", "sw.js"), "utf8")));

/* أدوات المحاكاة الحقيقية موجودة (توليد فعلي على Chromium) ولا تُنشر */
const e2e = path.join(ROOT, "tools", "e2e_render.js");
chk("محاكي التوليد الحقيقي موجود", fs.existsSync(e2e) && /renderSelfTest\(\{ deep: true \}\)/.test(fs.readFileSync(e2e, "utf8")));
chk("tools/ خارج public/ (لا يُنشر)", !fs.existsSync(path.join(ROOT, "public", "tools")));

console.log(errs.length ? `ERRORS ${errs.length}` : `ALL OK (${pass} checks)`);
if (errs.length) console.log(errs.map((e) => " - " + e).join("\n"));
process.exit(errs.length ? 1 : 0);

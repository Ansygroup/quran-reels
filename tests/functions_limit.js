#!/usr/bin/env node
/* ============================================================
 * حاجز عدد الدوال في Vercel — خطة Hobby تسمح بـ12 دالة لكل نشرة.
 * ------------------------------------------------------------
 * لماذا هذا الملف؟ لأن تجاوز الحد لا يُفشل البناء، بل يُفشل الرفع بعد نجاحه
 * (exceeded_serverless_functions_per_deployment) فتظل النسخة القديمة مخدومة
 * على الموقع — فشل صامت لا يتنبّه له أحد. حدث فعلًا في 2026-11-07.
 *
 * القاعدة:
 *   عدد الدوال = ملفات api/**‎.js التي لا تبدأ بـ _  +  middleware.js (يُحسب)
 *   يجب أن يكون ≤ 12، وننبّه إن وصل 12 (بلا هامش).
 *
 * الملفات المبدوءة بـ _ وحدات مساعدة فقط (Vercel لا يحوّلها إلى دوال)
 * وتُستدعى من دالة التوزيع api/gw.js.
 *
 * التشغيل: node tests/functions_limit.js  (ويُشغَّل تلقائيًا قبل npm test)
 * ============================================================ */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LIMIT = 12;
const NO_HEADROOM = 12;

const errs = [];
const warns = [];
const ok = (m) => console.log("OK   " + m);
const fail = (m) => { errs.push(m); console.log("FAIL " + m); };
const warn = (m) => { warns.push(m); console.log("WARN " + m); };

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = dir + path.sep + e.name;
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      walk(p, out);
    } else if (/\.(js|cjs|mjs|ts)$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

/* رسم مسار الملف إلى المسار العام: api/a/b.js → /api/a/b */
function routeOf(file) {
  const r = rel(file).replace(/\.(js|cjs|mjs|ts)$/, "");
  return "/" + r.replace(/\/index$/, "");
}

/* ---------------- 1) عدد الدوال ---------------- */
const apiDir = path.join(ROOT, "api");
let files = [];
if (fs.existsSync(apiDir)) files = walk(apiDir);

const fns = files.filter((f) => !path.basename(f).startsWith("_"));
const helpers = files.filter((f) => path.basename(f).startsWith("_"));
const middleware = fs.existsSync(path.join(ROOT, "middleware.js")) ? 1 : 0;
const total = fns.length + middleware;

console.log(`دوال api/: ${fns.length}  ·  وحدات مساعدة (_): ${helpers.length}  ·  middleware: ${middleware}  →  المجموع: ${total}/${LIMIT}`);
fns.forEach((f) => console.log("     · " + rel(f)));

if (total > LIMIT) {
  fail(`تجاوز حد Vercel Hobby: ${total} > ${LIMIT} — النشر سيُرفض. ادمج المسارات في api/gw.js (نمط ?op=) أو انقل الوحدة إلى ملف يبدأ بـ _`);
} else {
  ok(`العدد داخل الحد (${total} ≤ ${LIMIT})`);
}
if (total >= NO_HEADROOM && total <= LIMIT) {
  warn(`بلا هامش: ${total}/${LIMIT} — أي دالة جديدة تُفشل النشر. الأفضل الإبقاء على ≤ 9`);
}

/* ---------------- 2) منع عودة api/app-config.js ---------------- */
if (fs.existsSync(path.join(apiDir, "app-config.js"))) {
  fail("api/app-config.js موجود — إنه مكرر لوظيفة /api/ip?mode=config ويزيد العدّاد بلا داعٍ. احذفه واترك rewrite في vercel.json");
} else {
  ok("api/app-config.js غير موجود (يُخدَم عبر rewrite إلى /api/ip?mode=config)");
}

/* ---------------- 3) سلامة vercel.json ---------------- */
let cfg = null;
try {
  cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
  ok("vercel.json صالح (JSON)");
} catch (e) {
  fail("vercel.json غير صالح: " + e.message);
}

if (cfg) {
  const rewrites = Array.isArray(cfg.rewrites) ? cfg.rewrites : [];
  const byDest = (d) => rewrites.find((r) => (r.destination || "").startsWith(d));

  if (!byDest("/api/ip?mode=config") || !rewrites.some((r) => r.source === "/api/app-config")) {
    fail("rewrite /api/app-config → /api/ip?mode=config مفقود (العميل يعتمد عليه)");
  } else {
    ok("rewrite /api/app-config → /api/ip?mode=config موجود");
  }

  /* كل دالة مذكورة في functions يجب أن يكون ملفها موجودًا */
  for (const key of Object.keys(cfg.functions || {})) {
    if (!fs.existsSync(path.join(ROOT, key))) fail(`functions يشير إلى ملف غير موجود: ${key}`);
  }
  ok(`فحص functions: ${Object.keys(cfg.functions || {}).length} مدخلًا`);

  /* كل rewrite إلى /api/... يجب أن يصل إلى دالة موجودة */
  for (const r of rewrites) {
    const dest = String(r.destination || "");
    if (!dest.startsWith("/api/")) continue;
    const file = path.join(ROOT, dest.split("?")[0].replace(/^\//, "") + ".js");
    if (!fs.existsSync(file)) fail(`rewrite ${r.source} → ${dest}: الدالة ${rel(file)} غير موجودة`);
  }
  ok("فحص rewrites: كل الأهداف دوال موجودة");

  /* المسارات العامة التي لا يجوز أن تنكسر (مسجّلة عند مزوّدي OAuth/العميل) */
  const publicPaths = new Set(fns.map(routeOf).concat(rewrites.map((r) => r.source)));
  for (const p of ["/api/oauth", "/api/oauth/callback", "/api/social", "/api/publish", "/api/contact", "/api/app-config", "/api/ip", "/api/mcp"]) {
    if (!publicPaths.has(p)) fail(`المسار ${p} غير مخدوم (لا دالة ولا rewrite) — قد تكسر عميلًا قائمًا`);
  }
  ok("جميع المسارات العامة مخدومة (دالة أو rewrite)");

  /* المجدولات يجب أن تشير إلى دوال موجودة */
  for (const c of cfg.crons || []) {
    const file = path.join(ROOT, String(c.path).split("?")[0].replace(/^\//, "") + ".js");
    if (!fs.existsSync(file)) fail(`cron ${c.path}: الدالة ${rel(file)} غير موجودة`);
  }
  ok(`فحص crons: ${(cfg.crons || []).length} مجدولًا`);
}

/* ---------------- 4) api/gw.js موجود ويوزّع ---------------- */
const gw = path.join(apiDir, "gw.js");
if (!fs.existsSync(gw)) {
  fail("api/gw.js مفقود — دالة التوزيع التي تُبقي عدد الدوال منخفضًا");
} else {
  const src = fs.readFileSync(gw, "utf8");
  const block = (src.match(/const ROUTES = \{([\s\S]*?)\n\};/) || [, ""])[1];
  const missing = ["start", "list", "disconnect", "publish", "contact", "version"]
    .filter((op) => !new RegExp(`(^|[\\s,{])${op}\\s*[,:]`, "m").test(block));
  if (missing.length) fail(`api/gw.js لا يوزّع: ${missing.join(", ")}`);
  else ok("api/gw.js يوزّع start/list/disconnect/publish/contact/version");
}

/* ---------------- النتيجة ---------------- */
console.log("\n==== ERRORS (" + errs.length + ") ====");
if (errs.length) {
  errs.forEach((e) => console.log(" - " + e));
  console.log("\nاقرأ سبب الحاجز في أعلى tests/functions_limit.js");
  process.exit(1);
}
console.log("لا أخطاء — النشر لن يُرفض بسبب عدد الدوال ✓" + (warns.length ? ` (تنبيهات: ${warns.length})` : ""));

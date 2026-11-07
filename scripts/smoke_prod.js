#!/usr/bin/env node
/* ============================================================
 * فحص دخان بعد النشر — يتحقّق أن الدوال الحيّة تعمل، لا أن البناء «success» فقط.
 * ------------------------------------------------------------
 * لماذا هذا الملف؟ في 2026-11-07 كان آخر نشرProduction «Vercel success» كاملًا،
 * ومع ذلك كانت /api/autopilot و/api/cron/publish تعيدان 500
 * FUNCTION_INVOCATION_FAILED على كل طلب (require لحزمة ESM في أعلى
 * lib/autopilot.js)، فلوحة الحساب معطّلة والكرون اليومي يفشل بصمت أسبوعًا.
 * البناء لا يكشف ذلك: الدالة موجودة لكنها تنهار قبل معالجة الطلب.
 *
 * القاعدة: كل مسار عام يجب أن يعيد JSON بترميز صحيح، ولا صفحة خطأ HTML من Vercel.
 *
 * التشغيل:
 *   node scripts/smoke_prod.js                        # الموقع الإنتاجي
 *   node scripts/smoke_prod.js https://preview.url    # أي نشر
 *   node scripts/smoke_prod.js --expect-sha=c7491e0b  # ويتأكد أن المنشور هو هذا الالتزام
 * ============================================================ */
const DEFAULT_BASE = "https://quran-reels-tau.vercel.app";

const args = process.argv.slice(2);
const expectSha = (args.find((a) => a.startsWith("--expect-sha=")) || "").split("=")[1] || "";
const baseArg = args.find((a) => a.startsWith("http"));
const BASE = String(baseArg || process.env.SMOKE_BASE || DEFAULT_BASE).replace(/\/+$/, "");

/* الحالات المتوقعة: لا نسجّل الدخول هنا، فالهدف إثبات أن الوحدة تُحمَّل وتعيد JSON
 * (401/405 تعني «استُدعيت الدالة بنجاح»، أما 500 فتعني انهيار إقلاع). */
const ROUTES = [
  { path: "/api/ip", expect: [200], note: "دالة عامة" },
  { path: "/api/gw?op=version", expect: [200], note: "بوابة + بصمة الالتزام", check: (j) => (expectSha ? String(j.sha || "").startsWith(expectSha) : Boolean(j.sha)) },
  { path: "/api/autopilot", expect: [401], note: "لوحة الحساب (كانت 500)" },
  { path: "/api/cron/publish", expect: [401], note: "الكرون اليومي (كانت 500)" },
  { path: "/api/cron/monitor", expect: [401], note: "كرون المراقبة" },
  { path: "/api/publish", expect: [400, 401, 405], note: "النشر عبر البوابة" },
];

(async () => {
  const fails = [];
  const ok = (m) => console.log("OK   " + m);
  const bad = (m) => { fails.push(m); console.log("FAIL " + m); };
  console.log(`فحص الدخان على ${BASE}${expectSha ? ` (الالتزام المتوقع: ${expectSha})` : ""}\n`);

  for (const route of ROUTES) {
    const url = BASE + route.path;
    let res, body = "";
    try {
      res = await fetch(url, { headers: { accept: "application/json" }, redirect: "manual" });
      body = await res.text();
    } catch (error) {
      bad(`${route.path} — تعذّر الطلب: ${String(error?.message || error).slice(0, 120)}`);
      continue;
    }

    if (/FUNCTION_INVOCATION_FAILED|This page is unavailable|INTERNAL_SERVER_ERROR/.test(body)) {
      bad(`${route.path} — ${res.status} صفحة خطأ من Vercel (الدالة تنهار قبل معالجة الطلب) · ${route.note}`);
      continue;
    }
    if (!route.expect.includes(res.status)) {
      bad(`${route.path} — رمز غير متوقع ${res.status} (المتوقع ${route.expect.join("/")}) · ${route.note}`);
      continue;
    }
    const ct = res.headers.get("content-type") || "";
    let json = null;
    try { json = JSON.parse(body); } catch { /* يُفحص أدناه */ }
    if (!ct.includes("application/json") || !json || typeof json !== "object") {
      bad(`${route.path} — استجابة ليست JSON (${ct || "بلا ترميز"}) · ${route.note}`);
      continue;
    }
    if (route.check && !route.check(json)) {
      bad(`${route.path} — فحص إضافي فشل · ${JSON.stringify(json).slice(0, 160)}`);
      continue;
    }
    ok(`${route.path} — ${res.status} JSON · ${route.note}`);
  }

  console.log(`\n==== ${fails.length ? `FAILED (${fails.length})` : "ALL OK"} ====`);
  if (fails.length) {
    fails.forEach((f) => console.log(" - " + f));
    console.log("\nإن رأيت 500 FUNCTION_INVOCATION_FAILED: الدالة تُحمَّل بتبعية ثقيلة/ESM في نطاق");
    console.log("الوحدة (مثال: require(\"@sparticuz/chromium\") أعلى lib/autopilot.js). الحل: await");
    console.log("import() داخل الدالة التي تحتاجها. الحاجز: node tests/functions_limit.js");
    process.exit(1);
  }
  process.exit(0);
})();

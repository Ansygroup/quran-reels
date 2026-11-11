#!/usr/bin/env node
/* ============================================================
 * اختبار سلوك كرون المراقبة/الإنقاذ (api/cron/monitor.js)
 * ------------------------------------------------------------
 * لماذا؟ لأن هذا الملف هو «شبكة الأمان» اليومية: يُستدعى مرة واحدة
 * في اليوم، ولا أحد يلاحظ لو انكسر ترتيبه أو رجع 500 — ستضيع الأيام
 * بصمت. هنا نستدعيه كدالة حقيقية (كما يفعل Vercel) ببدائل للوحدات:
 *   • lib/autopilot  → catchUpDaily / backfillDaily قابلة للبرمجة
 *   • lib/monitor    → checkOwn / sitemapCount
 *   • lib/oauth.json → يكتب في كائن res مزيّف
 *
 * التشغيل: node tests/cron_monitor_test.js
 * ============================================================ */
const path = require("path");

const ROOT = path.join(__dirname, "..");
let pass = 0;
const errs = [];
const ok = (m) => { pass++; console.log("OK   " + m); };
const fail = (m) => { errs.push(m); console.log("FAIL " + m); };
const chk = (name, cond, extra = "") => (cond ? ok(name) : fail(name + (extra ? " :: " + extra : "")));

/* ---------------- بدائل الوحدات ---------------- */
const stub = {
  rescue: async () => [{ user_id: "u1", skipped: "published" }],
  backfill: async () => [{ user_id: "u1", skipped: "nothing-missing" }],
  calls: { rescue: 0, backfill: 0 },
  own: null,
  sitemap: async () => ({ ok: true, count: 42 }),
};

function cacheModule(rel, exports) {
  const file = require.resolve(path.join(ROOT, rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
  return file;
}

cacheModule("lib/autopilot.js", {
  catchUpDaily: async (...a) => { stub.calls.rescue++; return stub.rescue(...a); },
  backfillDaily: async (...a) => { stub.calls.backfill++; return stub.backfill(...a); },
});
cacheModule("lib/monitor.js", {
  checkOwn: async () => stub.own || {
    sitemap: { ok: true },
    urls: { total: 7, bad: [] },
    robots: { ok: true, hasSitemap: true },
    llms: { ok: true },
    home: { ok: true, verification: true },
  },
  sitemapCount: (...a) => stub.sitemap(...a),
});
cacheModule("lib/oauth.js", {
  json: (res, code, obj) => {
    res.statusCode = code;
    res.body = obj;
    res.ended = true;
  },
});

const handler = require(path.join(ROOT, "api", "cron", "monitor.js"));

function mkRes() {
  const res = { statusCode: 0, body: null, ended: false, headers: {}, setHeader() {}, end() { this.ended = true; } };
  return res;
}
const mkReq = (url = "/api/cron/monitor", auth = "Bearer s3cret") => ({ url, headers: auth ? { authorization: auth } : {} });

async function call({ url, auth } = {}) {
  const res = mkRes();
  await handler(mkReq(url, auth), res);
  return res;
}

function reset() {
  stub.calls = { rescue: 0, backfill: 0 };
  stub.rescue = async () => [{ user_id: "u1", skipped: "published" }];
  stub.backfill = async () => [{ user_id: "u1", skipped: "nothing-missing" }];
  stub.own = null;
  process.env.CRON_SECRET = "s3cret";
}

(async () => {
  /* 1) الحراسة */
  reset();
  const noAuth = await call({ auth: null });
  chk("بلا ترويسة التفويض ⇒ 401", noAuth.statusCode === 401 && noAuth.body && noAuth.body.error === "unauthorized");
  const badAuth = await call({ auth: "Bearer wrong" });
  chk("توكن خاطئ ⇒ 401", badAuth.statusCode === 401);
  chk("401 لا يشغّل الإنقاذ ولا التعويض", stub.calls.rescue === 0 && stub.calls.backfill === 0);

  /* 2) المسار اليومي: إنقاذ ثم تعويض عندما يكون اليوم مضبوطًا */
  reset();
  const daily = await call();
  chk("الرد 200 مع يوم rescue-only", daily.statusCode === 200 && daily.body && daily.body.day === "rescue-only" && daily.body.ok === true, JSON.stringify(daily.body).slice(0, 200));
  chk("الرد يحمل rescue وbackfill", Array.isArray(daily.body.rescue) && Array.isArray(daily.body.backfill));
  chk("اليوم منشور ⇒ التعويض يعمل", stub.calls.rescue === 1 && stub.calls.backfill === 1);
  chk("لا فحص موقع كامل في يوم عادي", daily.body.checked === undefined && daily.body.sitemap === undefined);

  /* 3) اليوم قيد الرندر ⇒ لا تعويض (حماية الميزانية) */
  reset();
  stub.rescue = async () => [{ user_id: "u1", skipped: "running" }];
  const running = await call();
  chk("اليوم قيد الرندر ⇒ تعويض مؤجّل", stub.calls.backfill === 0 && running.body.backfill[0].skipped === "rescue-pending", JSON.stringify(running.body.backfill));

  /* 3b) يوم مُغطّى من ملف مخزّن (G37/G38) ⇒ التعويض مسموح */
  reset();
  stub.rescue = async () => [{ user_id: "u1", skipped: "rendered-cached", ok: true }];
  await call();
  chk("نُشر من ملف مخزّن ⇒ التعويض يعمل", stub.calls.backfill === 1);
  reset();
  stub.rescue = async () => [{ user_id: "u1", skipped: "published-cached", ok: true }];
  await call();
  chk("منشور سابقًا (صفّ منشور) ⇒ التعويض يعمل", stub.calls.backfill === 1);

  /* 4) الإنقاذ أنتج توليدًا فعليًا ⇒ لا تعويض في نفس التشغيل */
  reset();
  stub.rescue = async () => [{ user_id: "u1", ok: true, url: "https://youtu.be/x", catchup: true }];
  const rendered = await call();
  chk("إنقاذ ولّد الآن ⇒ لا تعويض (الميزانية ٣٠٠ث)", stub.calls.backfill === 0 && rendered.body.backfill[0].skipped === "rescue-pending");

  /* 5) استثناء في الإنقاذ لا يُسقط الكرون */
  reset();
  stub.rescue = async () => { throw new Error("db down"); };
  const thrown = await call();
  chk("استثناء الإنقاذ يُلتقط ويُبلّغ", thrown.statusCode === 200 && thrown.body.rescue[0].ok === false && /db down/.test(thrown.body.rescue[0].error));
  chk("لا تعويض عند فشل الإنقاذ", stub.calls.backfill === 0);

  /* 6) استثناء في التعويض لا يُسقط الرد */
  reset();
  stub.backfill = async () => { throw new Error("backfill boom"); };
  const bfErr = await call();
  chk("استثناء التعويض يُلتقط", bfErr.statusCode === 200 && bfErr.body.backfill[0].ok === false && /backfill boom/.test(bfErr.body.backfill[0].error));

  /* 7) الفحص الكامل عند ?full=1 */
  reset();
  const fullOk = await call({ url: "/api/cron/monitor?full=1" });
  chk("?full=1 يشغّل فحص الموقع", fullOk.body.checked === 7 && fullOk.body.sitemap && fullOk.body.sitemap.ok === true, JSON.stringify(fullOk.body).slice(0, 200));
  chk("الفحص الناجح ⇒ 200 ok:true", fullOk.statusCode === 200 && fullOk.body.ok === true);
  chk("الفحص الكامل يحمل نتائج المنافسين", Boolean(fullOk.body.competitors));

  reset();
  stub.own = {
    sitemap: { ok: true },
    urls: { total: 3, bad: [{ status: 404, url: "/x" }] },
    robots: { ok: true, hasSitemap: true },
    llms: { ok: true },
    home: { ok: true, verification: true },
  };
  const fullBad = await call({ url: "/api/cron/monitor?full=1" });
  chk("روابط مكسورة في الفحص الكامل ⇒ 503", fullBad.statusCode === 503 && fullBad.body.ok === false && fullBad.body.bad.length === 1);

  /* 8) فشل مغلق: بلا CRON_SECRET لا يُسمح بإطلاق توليد من الإنترنت */
  reset();
  delete process.env.CRON_SECRET;
  const noSecret = await call();
  chk("بلا CRON_SECRET ⇒ 401 (فشل مغلق)", noSecret.statusCode === 401 && stub.calls.rescue === 0);
  process.env.CRON_SECRET = "s3cret";

  console.log(errs.length ? `ERRORS ${errs.length}` : `ALL OK (${pass} checks)`);
  if (errs.length) console.log(errs.map((e) => " - " + e).join("\n"));
  process.exit(errs.length ? 1 : 0);
})().catch((e) => {
  console.log("FAIL استثناء غير متوقع: " + (e && e.stack ? e.stack.split("\n").slice(0, 2).join(" | ") : e));
  process.exit(1);
});

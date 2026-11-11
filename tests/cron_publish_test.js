#!/usr/bin/env node
/* ============================================================
 * اختبار سلوك كرون النشر اليومي (api/cron/publish.js)
 * ------------------------------------------------------------
 * هذا هو التشغيل الوحيد المسموح على خطة Hobby (04:15 UTC). إن انكسر
 * ترتيبه أو رجع 500 صامتًا فلا فيديو اليوم — ولا أحد يعرف. الاختبار
 * يستدعي الدالة الحقيقية ببدائل: lib/db (q)، lib/publish (publishRow)،
 * lib/autopilot (runDailyAutopilots)، lib/oauth.json.
 *
 * التشغيل: node tests/cron_publish_test.js
 * ============================================================ */
const path = require("path");

const ROOT = path.join(__dirname, "..");
let pass = 0;
const errs = [];
const ok = (m) => { pass++; console.log("OK   " + m); };
const fail = (m) => { errs.push(m); console.log("FAIL " + m); };
const chk = (name, cond, extra = "") => (cond ? ok(name) : fail(name + (extra ? " :: " + extra : "")));

const stub = {
  autopilot: async () => [{ ok: true, url: "https://youtu.be/x" }],
  queue: [],
  publish: async (row) => ({ ok: true, url: "https://youtu.be/" + row.id }),
  calls: { autopilot: 0, publish: [] },
  sql: [],
};

function cacheModule(rel, exports) {
  const file = require.resolve(path.join(ROOT, rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

cacheModule("lib/db.js", {
  q: async (sql, params) => { stub.sql.push({ sql: String(sql), params }); return stub.queue; },
  q1: async () => null,
  rest: async () => [],
});
cacheModule("lib/publish.js", {
  publishRow: async (row) => { stub.calls.publish.push(row.id); return stub.publish(row); },
  videoUrl: () => "",
  pickConnection: () => null,
});
cacheModule("lib/autopilot.js", {
  runDailyAutopilots: async () => { stub.calls.autopilot++; return stub.autopilot(); },
});
cacheModule("lib/oauth.js", { json: (res, code, obj) => { res.statusCode = code; res.body = obj; } });

const handler = require(path.join(ROOT, "api", "cron", "publish.js"));

const mkRes = () => ({ statusCode: 0, body: null, setHeader() {}, end() {} });
const mkReq = (auth = "Bearer s3cret") => ({ url: "/api/cron/publish", headers: auth ? { authorization: auth } : {} });

async function call(auth) {
  const res = mkRes();
  await handler(mkReq(auth), res);
  return res;
}

function reset() {
  stub.calls = { autopilot: 0, publish: [] };
  stub.sql = [];
  stub.queue = [];
  stub.autopilot = async () => [{ ok: true, url: "https://youtu.be/x" }];
  stub.publish = async (row) => ({ ok: true, url: "https://youtu.be/" + row.id });
  process.env.CRON_SECRET = "s3cret";
}

(async () => {
  /* 1) الحراسة */
  reset();
  delete process.env.CRON_SECRET;
  const noSecret = await call();
  chk("بلا CRON_SECRET ⇒ 401 ولا تشغيل", noSecret.statusCode === 401 && stub.calls.autopilot === 0);
  process.env.CRON_SECRET = "s3cret";
  reset();
  chk("توكن خاطئ ⇒ 401", (await call("Bearer nope")).statusCode === 401 && stub.calls.autopilot === 0);
  chk("بلا ترويسة ⇒ 401", (await call(null)).statusCode === 401);

  /* 2) التشغيل اليومي يُستدعى مرة واحدة */
  reset();
  const r1 = await call();
  chk("يشغّل الأتمتة اليومية مرة واحدة", stub.calls.autopilot === 1);
  chk("الرد يحمل ملخص الأتمتة", r1.body.autopilot && r1.body.autopilot.ran === 1 && r1.body.autopilot.ok === 1, JSON.stringify(r1.body).slice(0, 200));

  /* 3) ينشر المهام المستحقة فقط (استعلام القائمة) */
  chk("يقرأ المهام المستحقة (scheduled + publish_at <= now)",
    stub.sql.some((c) => /from publish_queue/i.test(c.sql) && /status='scheduled'/i.test(c.sql) && /publish_at <= now\(\)/i.test(c.sql)));

  reset();
  stub.queue = [{ id: "q1" }, { id: "q2" }, { id: "q3" }];
  stub.publish = async (row) => (row.id === "q2" ? { ok: false, error: "token expired" } : { ok: true, url: "https://youtu.be/" + row.id });
  const r2 = await call();
  chk("ينشر كل صفّ مستحق ويحصي النتائج", r2.body.ran === 3 && r2.body.ok === 2 && r2.body.fail === 1, JSON.stringify(r2.body).slice(0, 200));
  chk("أخطاء النشر تُعاد مختصرة", r2.body.errors.length === 1 && /token expired/.test(r2.body.errors[0]));
  chk("كل صفّ مرّ على publishRow", stub.calls.publish.join(",") === "q1,q2,q3");

  /* 4) فشل الأتمتة لا يمنع نشر المستحق */
  reset();
  stub.autopilot = async () => { throw new Error("render exploded"); };
  stub.queue = [{ id: "q9" }];
  const r3 = await call();
  chk("استثناء الأتمتة يُلتقط ويُبلّغ سببه في الرد",
    r3.statusCode === 200 && r3.body.autopilot.ok === 0 &&
    r3.body.autopilot.errors.length === 1 && /render exploded/.test(r3.body.autopilot.errors[0]),
    JSON.stringify(r3.body).slice(0, 240));
  chk("الاستثناء يُسجَّل في system_checks (لا فشل صامت)",
    stub.sql.some((c) => /insert into system_checks/i.test(c.sql) && /autopilot_daily/.test(c.sql)), JSON.stringify(stub.sql.map((c) => c.sql)).slice(0, 200));
  chk("المهام المستحقة تُنشر رغم فشل الأتمتة", r3.body.ok === 1 && r3.body.ran === 1);

  /* 5) فشل كل الأتمتة يُبلّغ fail=1 */
  reset();
  stub.autopilot = async () => [{ ok: false, error: "x" }];
  const r4 = await call();
  chk("نتيجة أتمتة فاشلة ⇒ autopilot.fail", r4.body.autopilot.fail === 1 && r4.body.autopilot.ok === 0);

  console.log(errs.length ? `ERRORS ${errs.length}` : `ALL OK (${pass} checks)`);
  if (errs.length) console.log(errs.map((e) => " - " + e).join("\n"));
  process.exit(errs.length ? 1 : 0);
})().catch((e) => {
  console.log("FAIL استثناء غير متوقع: " + (e && e.stack ? e.stack.split("\n").slice(0, 2).join(" | ") : e));
  process.exit(1);
});

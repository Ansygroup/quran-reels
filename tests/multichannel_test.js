#!/usr/bin/env node
/* ============================================================
 * اختبار تعدد القنوات (G27) — أكثر من قناة يوتيوب لنفس المستخدم
 * ------------------------------------------------------------
 * قبل ذلك: النشر كان يأخذ «أحدث صف مربوط» (order by updated_at desc limit 1)،
 * فربط قناة ثانية يحوّل هدف النشر إليها بصمت، ولا توجد واجهة لتعيين قناة.
 * الآن: قناة افتراضية واحدة لكل منصة + إمكانية توجيه مهمة لقناة بعينها.
 *
 * التشغيل: node tests/multichannel_test.js
 * ============================================================ */
process.env.TOKEN_ENC_KEY = process.env.TOKEN_ENC_KEY || "test-key-multichannel";

const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..");

let pass = 0;
const errs = [];
const ok = (m) => { pass++; console.log("OK   " + m); };
const fail = (m) => { errs.push(m); console.log("FAIL " + m); };
const chk = (name, cond, extra = "") => (cond ? ok(name) : fail(name + (extra ? " :: " + extra : "")));

/* بدائل: الجلسة + قاعدة البيانات */
const sessPath = require.resolve(path.join(ROOT, "lib", "sess.js"));
require.cache[sessPath] = { id: sessPath, filename: sessPath, loaded: true, exports: { getUserId: async () => "user-7" } };

const calls = [];
const impl = {
  q: async (sql, params) => { calls.push({ sql, params }); return []; },
  q1: async (sql, params) => { calls.push({ sql, params }); return null; },
  rest: async () => [],
};
const dbPath = require.resolve(path.join(ROOT, "lib", "db.js"));
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { q: (...a) => impl.q(...a), q1: (...a) => impl.q1(...a), rest: (...a) => impl.rest(...a) },
};
const setDb = (o) => Object.assign(impl, o);

const pub = require(path.join(ROOT, "lib", "publish.js"));
const PICK = pub.pickConnection;
const DEF = require(path.join(ROOT, "lib", "soc_default.js"));
const LIST = require(path.join(ROOT, "lib", "soc_list.js"));
const { seal } = require(path.join(ROOT, "lib", "crypt.js"));
const { json } = require(path.join(ROOT, "lib", "oauth.js"));

/* أدوات HTTP وهمية */
const mkRes = () => {
  const res = {
    statusCode: 200, body: "",
    setHeader() {}, end(s) { this.body = String(s || ""); },
  };
  return res;
};
const mkPost = (body) => {
  const req = { method: "POST", headers: {}, _data: JSON.stringify(body || {}) };
  req.on = (ev, cb) => { if (ev === "data") cb(req._data); if (ev === "end") cb(); };
  return req;
};
const mkGet = () => ({ method: "GET", headers: {}, url: "/api/gw?op=list", on() {} });

const conn = (id, extra = {}) => ({ id, platform: "youtube", account_name: "قناة " + id, updated_at: "2026-11-01T00:00:00Z", ...extra });

(async () => {
  /* 1) منطق الاختيار */
  const older = conn("a", { updated_at: "2026-11-01T00:00:00Z" });
  const newer = conn("b", { updated_at: "2026-11-05T00:00:00Z" });
  chk("بلا افتراضية ⇒ الأحدث تحديثًا (السلوك القديم محفوظ)", PICK([older, newer])?.id === "b");
  chk("القناة الافتراضية تتقدّم على الأحدث", PICK([older, { ...newer, is_default: true }])?.id === "b");
  chk("الافتراضية الأقدم تفوز أيضًا", PICK([{ ...older, is_default: true }, newer])?.id === "a");
  chk("قناة مطلوبة صراحةً تفوز على الافتراضية", PICK([{ ...older, is_default: true }, newer], "b")?.id === "b");
  chk("قناة مطلوبة غير مملوكة ⇒ تراجع للافتراضية", PICK([{ ...older, is_default: true }, newer], "zzz")?.id === "a");
  chk("قائمة فارغة ⇒ null", PICK([]) === null && PICK(null) === null);
  chk("قيمة is_default بصيغة Postgres ('t') تُفهم", PICK([older, conn("c", { is_default: "t" })])?.id === "c");

  /* 2) publishRow يستخدم كل قنوات المنصة ويختار الافتراضية */
  let rowErr = null;
  const pq = [];
  setDb({
    q: async (sql) => {
      pq.push(sql);
      if (/from social_connections/i.test(sql)) return [{ ...older, is_default: true }, newer];
      return [];
    },
    q1: async () => null,
  });
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 500, headers: { get: () => "0" }, json: async () => ({}), text: async () => "" });
  try { await pub.publishRow({ id: "q1", user_id: "user-7", platform: "youtube", title: "t" }); } catch (e) { rowErr = e; }
  global.fetch = realFetch;
  chk("publishRow يقرأ كل قنوات المنصة (لا limit 1 في الاستعلام)",
    pq.some((sql) => /from social_connections/i.test(sql) && !/limit 1/i.test(sql)), pq.filter((sql) => /social_connections/i.test(sql)).join(" | ").slice(0, 160));

  setDb({ q: async (sql) => (/from social_connections/i.test(sql) ? [] : []), q1: async () => null });
  const noConn = await pub.publishRow({ id: "q2", user_id: "user-7", platform: "youtube" });
  chk("بلا أي قناة مرتبطة ⇒ رسالة واضحة", noConn.ok === false && /لا يوجد ربط/.test(String(noConn.error)), String(noConn.error));

  /* 3) تعيين القناة الافتراضية عبر /api/gw?op=default */
  calls.length = 0;
  setDb({
    q1: async (sql, p) => (/from social_connections/i.test(sql) && p[0] !== "not-mine" ? { id: p[0], platform: "youtube" } : null),
    q: async (sql, p) => { calls.push({ sql, p }); return []; },
  });
  const res1 = mkRes();
  await DEF(mkPost({ id: "c-new" }), res1);
  const out1 = JSON.parse(res1.body || "{}");
  chk("تعيين الافتراضية ينجح", res1.statusCode === 200 && out1.ok === true && out1.platform === "youtube", res1.body);
  chk("يُصفّر افتراضية بقية قنوات المنصة أولًا",
    calls.some((c) => /set is_default=false/i.test(c.sql) && c.p[0] === "user-7" && c.p[1] === "youtube"));
  chk("ثم يعلّم القناة المطلوبة",
    calls.some((c) => /set is_default=true/i.test(c.sql) && c.p[0] === "c-new" && c.p[1] === "user-7"));

  const res2 = mkRes();
  await DEF(mkPost({ id: "not-mine" }), res2);
  chk("قناة مستخدم آخر تُرفض", res2.statusCode === 404, String(res2.statusCode));

  const res3 = mkRes();
  await DEF(mkPost({}), res3);
  chk("بلا معرّف ⇒ 400", res3.statusCode === 400, String(res3.statusCode));

  const res4 = mkRes();
  await DEF({ method: "GET", headers: {}, on() {} }, res4);
  chk("GET مرفوض (405)", res4.statusCode === 405, String(res4.statusCode));

  /* 4) القائمة تُرجع is_default */
  setDb({
    q: async () => [
      { id: "y1", platform: "youtube", account_name: "قناة أولى", meta: seal(JSON.stringify({ channel: "قناة أولى" })), scopes: "", expires_at: null, updated_at: "2026-11-01", is_default: true },
      { id: "y2", platform: "youtube", account_name: "قناة ثانية", meta: seal(JSON.stringify({ channel: "قناة ثانية" })), scopes: "", expires_at: null, updated_at: "2026-11-02", is_default: false },
    ],
  });
  const res5 = mkRes();
  await LIST(mkGet(), res5);
  const list = JSON.parse(res5.body || "{}");
  chk("القائمة تعرض القناتين", Array.isArray(list.connections) && list.connections.length === 2, String(list.connections && list.connections.length));
  chk("القائمة تحدد الافتراضية", list.connections?.find((c) => c.id === "y1")?.is_default === true && list.connections?.find((c) => c.id === "y2")?.is_default === false);
  chk("القائمة لا تُسرّب التوكنات", !/access_token|refresh_token|sealed/.test(res5.body));

  /* 5) مسار النشر يقبل connection_id ويتحقق من الملكية */
  const gw = fs.readFileSync(path.join(ROOT, "api", "_publish.js"), "utf8");
  chk("insert publish_queue يحفظ connection_id", /connection_id\)/.test(gw) && /\$10/.test(gw));
  chk("يتحقق من ملكية القناة قبل القبول", /select id, platform from social_connections where id=\$1 and user_id=\$2/.test(gw));
  chk("يرفض قناة من منصة أخرى", /قناة غير مرتبطة بهذه المنصة/.test(gw));

  /* 6) الواجهة: شارة افتراضية + إضافة قناة + ربط المعالج */
  const ui = fs.readFileSync(path.join(ROOT, "public", "js", "publish.js"), "utf8");
  chk("بطاقة القنوات تعرض شارة ⭐ افتراضية", /⭐ افتراضية/.test(ui));
  chk("زر «اجعلها الافتراضية» موجود ومربوط", /data-default="\$\{c\.id\}"/.test(ui) && /op=default/.test(ui));
  chk("زر «➕ إضافة قناة» لمستخدم عنده قناة بالفعل", /➕ إضافة قناة/.test(ui));
  chk("تلميح أن النشر على القناة الافتراضية", /يُنشر على القناة الافتراضية/.test(ui));
  chk("الكاش مكسور (v=18) في الماركب والخدمة",
    /publish\.js\?v=18/.test(fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8")) &&
    /qr-v19/.test(fs.readFileSync(path.join(ROOT, "public", "sw.js"), "utf8")));

  /* 7) ملف الترحيل */
  const mig = path.join(ROOT, "sql", "migrations", "20261112_multi_channel.sql");
  chk("ترحيل is_default + connection_id موجود", fs.existsSync(mig) && /add column if not exists is_default/i.test(fs.readFileSync(mig, "utf8")) && /connection_id uuid/i.test(fs.readFileSync(mig, "utf8")));
  chk("فهرس يضمن افتراضية واحدة لكل منصة", /social_connections_one_default/.test(fs.readFileSync(mig, "utf8")));

  /* 8) أول قناة تصبح افتراضية تلقائيًا، ولا نلمس افتراضية موجودة */
  const defCalls = [];
  setDb({ q: async (sql, params) => { defCalls.push({ sql, params }); return []; } });
  const ensured = await require(path.join(ROOT, "lib", "soc_default.js")).ensureDefault("user-7", "youtube");
  chk("ensureDefault ينجح", ensured === true);
  const dsql = (defCalls[0] || {}).sql || "";
  chk("ensureDefault لا يغيّر منصة لها افتراضية", /not exists \(select 1 from social_connections d/.test(dsql));
  chk("ensureDefault يستهدف أحدث قناة فقط", /order by updated_at desc limit 1/.test(dsql) && (defCalls[0].params || [])[0] === "user-7");
  setDb({ q: async () => { throw new Error("db down"); } });
  chk("فشل ensureDefault لا يُفشل الربط", (await require(path.join(ROOT, "lib", "soc_default.js")).ensureDefault("user-7", "youtube")) === false);

  for (const f of ["cb_youtube.js", "cb_meta.js", "cb_tiktok.js", "cb_x.js"]) {
    const src = fs.readFileSync(path.join(ROOT, "lib", f), "utf8");
    chk(`${f}: يستدعي ensureDefault بعد الحفظ`, /ensureDefault\(saved\.u,/.test(src), f);
  }

  console.log(errs.length ? `ERRORS ${errs.length}` : `ALL OK (${pass} checks)`);
  if (errs.length) console.log(errs.map((e) => " - " + e).join("\n"));
  process.exit(errs.length ? 1 : 0);
})().catch((e) => {
  console.log("FAIL استثناء غير متوقع: " + (e && e.stack ? e.stack.split("\n")[0] : e));
  process.exit(1);
});

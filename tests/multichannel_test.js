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
  chk("قناة مطلوبة غير مملوكة ⇒ لا نشر على الافتراضية", PICK([{ ...older, is_default: true }, newer], "zzz") === null);
  chk("قائمة فارغة ⇒ null", PICK([]) === null && PICK(null) === null);
  chk("قيمة is_default بصيغة Postgres ('t') تُفهم", PICK([older, conn("c", { is_default: "t" })])?.id === "c");

  /* 2) publishRow يستخدم كل قنوات المنصة ويختار الافتراضية */
  let rowErr = null;
  const pq = [];
  setDb({
    q: async (sql) => {
      pq.push(sql);
      if (/set status='publishing'/i.test(sql)) return [{ id: "q1", user_id: "user-7", platform: "youtube", status: "publishing" }];
      if (/from social_connections/i.test(sql)) return [{ ...older, is_default: true }, newer];
      return [];
    },
    q1: async () => null,
  });
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 500, headers: { get: () => "0" }, json: async () => ({}), text: async () => "" });
  try { await pub.publishRow({ id: "q1", user_id: "user-7", platform: "youtube", title: "t", status: "scheduled" }); } catch (e) { rowErr = e; }
  global.fetch = realFetch;
  chk("publishRow يقرأ كل قنوات المنصة (لا limit 1 في الاستعلام)",
    pq.some((sql) => /from social_connections/i.test(sql) && !/limit 1/i.test(sql)), pq.filter((sql) => /social_connections/i.test(sql)).join(" | ").slice(0, 160));

  setDb({ q: async (sql) => (/set status='publishing'/i.test(sql) ? [{ id: "q2", user_id: "user-7", platform: "youtube" }] : []), q1: async () => null });
  const noConn = await pub.publishRow({ id: "q2", user_id: "user-7", platform: "youtube", status: "scheduled" });
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
  chk("زر «اجعلها الافتراضية» موجود ومربوط", /data-default="\$\{(?:this\.)?esc\(c\.id\)\}"/.test(ui) && /op=default/.test(ui));
  chk("زر «➕ إضافة قناة» لمستخدم عنده قناة بالفعل", /➕ إضافة قناة/.test(ui));
  chk("تلميح أن النشر على القناة الافتراضية", /اختيارك الحالي: النشر على القناة الافتراضية/.test(ui) && /اختيارك الحالي: النشر على كل القنوات المرتبطة/.test(ui));
  chk("الكاش مكسور (v=35 / qr-v45) في الماركب والخدمة",
    /publish\.js\?v=35/.test(fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8")) &&
    /qr-v45/.test(fs.readFileSync(path.join(ROOT, "public", "sw.js"), "utf8")));

  /* 7) ملف الترحيل */
  const mig = path.join(ROOT, "sql", "migrations", "20261112_multi_channel.sql");
  chk("ترحيل is_default + connection_id موجود", fs.existsSync(mig) && /add column if not exists is_default/i.test(fs.readFileSync(mig, "utf8")) && /connection_id uuid/i.test(fs.readFileSync(mig, "utf8")));
  chk("فهرس يضمن افتراضية واحدة لكل منصة", /social_connections_one_default/.test(fs.readFileSync(mig, "utf8")));

  /* 8) أول قناة تصبح افتراضية تلقائيًا، ولا نلمس افتراضية موجودة */
  const defCalls = [];
  setDb({ q: async (sql, params) => {
    defCalls.push({ sql, params });
    if (/^select/i.test(sql)) return [{ id: "ch-newest", is_default: false }];
    return [];
  } });
  const ensured = await require(path.join(ROOT, "lib", "soc_default.js")).ensureDefault("user-7", "youtube");
  chk("ensureDefault ينجح", ensured === true);
  const dsql = (defCalls[0] || {}).sql || "";
  /* لم يبقَ subquery: طبقة db تُترجم إلى PostgREST وsubqueries تسقط بصمت
   * فيصير التحديث PATCH بلا فلتر (كل القنوات تصبح افتراضية). */
  chk("ensureDefault بلا subquery (قراءة ثم تحديث بمعرّف)",
    /^select/i.test(dsql) && !/not exists/i.test(dsql) && defCalls.length >= 2 && /where id=\$1/.test(defCalls[1].sql || ""),
    JSON.stringify(defCalls.map((c) => c.sql.slice(0, 60))));
  chk("ensureDefault يستهدف أحدث قناة فقط", (defCalls[1].params || [])[0] === "ch-newest");
  const withDef = [];
  setDb({ q: async (sql) => { withDef.push(sql); if (/^select/i.test(sql)) return [{ id: "a", is_default: true }]; return []; } });
  await require(path.join(ROOT, "lib", "soc_default.js")).ensureDefault("user-8", "youtube");
  chk("منصة لها افتراضية ⇒ لا تحديث أصلًا", withDef.filter((x) => /^update/i.test(x)).length === 0, String(withDef.length));
  setDb({ q: async () => { throw new Error("db down"); } });
  chk("فشل ensureDefault لا يُفشل الربط", (await require(path.join(ROOT, "lib", "soc_default.js")).ensureDefault("user-7", "youtube")) === false);

  for (const f of ["cb_youtube.js", "cb_meta.js", "cb_tiktok.js", "cb_x.js"]) {
    const src = fs.readFileSync(path.join(ROOT, "lib", f), "utf8");
    chk(`${f}: يستدعي ensureDefault بعد الحفظ`, /ensureDefault\(saved\.u,/.test(src), f);
  }

  /* 9) «انشر على كل القنوات المرتبطة» في التشغيل الآلي */
  const A = require(path.join(ROOT, "lib", "autopilot.js"));
  const PT = A.__test.planTargets;
  const two = { youtube: [{ id: "y1" }, { id: "y2" }] };
  chk("معطّل ⇒ مهمة واحدة لكل منصة بلا قناة محددة",
    JSON.stringify(PT(["youtube"], two, false)) === JSON.stringify([{ platform: "youtube", connection_id: null }]));
  const on = PT(["youtube"], two, true);
  chk("مفعّل ⇒ مهمة لكل قناة مع connection_id", on.length === 2 && on[0].connection_id === "y1" && on[1].connection_id === "y2", JSON.stringify(on));
  let emptyBlocked = false;
  try { PT(["youtube"], {}, true); } catch { emptyBlocked = true; }
  chk("مفعّل بلا قنوات ⇒ يوقف بدل قناة افتراضية مجهولة", emptyBlocked);
  let mixedBlocked = false;
  try { PT(["youtube", "tiktok"], { youtube: [{ id: "y1" }], tiktok: [] }, true); } catch { mixedBlocked = true; }
  chk("قائمة قنوات ناقصة تمنع الإعلان عن نشر كامل", mixedBlocked);
  chk("قائمة منصات فارغة ⇒ لا أهداف", PT([], {}, true).length === 0 && PT(null, {}, true).length === 0);

  const autoSrc = fs.readFileSync(path.join(ROOT, "lib", "autopilot.js"), "utf8");
  chk("التشغيل يستخدم planTargets ويمرّر connection_id",
    /planTargets\(platforms, connsByPlatform/.test(autoSrc) &&
    (/connection_id, video_path: storagePath/.test(autoSrc) || /connection_id: connectionId, video_path: storagePath/.test(autoSrc)) &&
    /queueTargets\(run.id, userId, storagePath, rendered.filename, targets/.test(autoSrc));
  chk("يقرأ كل القنوات فقط عند تفعيل الخيار", /runConfig\?\.all_channels === true/.test(autoSrc) && /connectionsFor\(userId, platform\)/.test(autoSrc));
  const apiSrc = fs.readFileSync(path.join(ROOT, "api", "autopilot.js"), "utf8");
  chk("الـAPI يحفظ all_channels ويعيده", /all_channels = body\.all_channels === true/.test(apiSrc) && /all_channels: config\.all_channels === true/.test(apiSrc));
  const uiSrc = fs.readFileSync(path.join(ROOT, "public", "js", "publish.js"), "utf8");
  chk("الواجهة تُظهر المفتاح عند تعدد القنوات وترسله",
    /chkAllChannels/.test(uiSrc) && /(multi|multiChannel)\s*\?/.test(uiSrc) && /all_channels: q2\("chkAllChannels"\)/.test(uiSrc));
  chk("ترحيل all_channels موجود", fs.existsSync(path.join(ROOT, "sql", "migrations", "20261112_autopilot_all_channels.sql")));

  console.log(errs.length ? `ERRORS ${errs.length}` : `ALL OK (${pass} checks)`);
  if (errs.length) console.log(errs.map((e) => " - " + e).join("\n"));
  process.exit(errs.length ? 1 : 0);
})().catch((e) => {
  console.log("FAIL استثناء غير متوقع: " + (e && e.stack ? e.stack.split("\n")[0] : e));
  process.exit(1);
});

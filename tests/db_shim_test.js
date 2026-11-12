#!/usr/bin/env node
/* ============================================================
 * حاجز طبقة قاعدة البيانات (lib/db.js)
 * ------------------------------------------------------------
 * الدرس (2026-11-12): الطبقة تُترجم SQL إلى PostgREST، وكانت **تُسقط بصمت**
 * كل شرط لا تفهمه. النتيجة لم تكن رسالة خطأ بل أسوأ:
 *   • `update publish_queue … where id = any($1::uuid[])` ⇒ PATCH بلا فلتر
 *     ⇒ كل صفوف الجدول تصير draft.
 *   • `… video_path like $2 …` ⇒ الشرط يسقط ⇒ dayHasPublish تعيد true دائمًا
 *     ⇒ الإنقاذ والتعويض يتخطّيان كل يوم بلا أن ينشر.
 *   • `detail=$1::jsonb` ⇒ العمود يسقط من الـINSERT.
 * هنا نُثبت: (١) الترجمة صحيحة للصيغ المستعملة فعلًا، (٢) الشرط غير المفهوم
 * يُطلق خطأً، (٣) لا UPDATE/DELETE بلا شرط، (٤) كل موضع q() في المشروع
 * قابل للترجمة (فحص ثابت على المصادر).
 *
 * التشغيل: node tests/db_shim_test.js
 * ============================================================ */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let pass = 0;
const errs = [];
const ok = (m) => { pass++; console.log("OK   " + m); };
const fail = (m) => { errs.push(m); console.log("FAIL " + m); };
const chk = (n, c, extra = "") => (c ? ok(n) : fail(n + (extra ? " :: " + extra : "")));

/* ---- اعتراض الشبكة ---- */
const calls = [];
global.fetch = async (url, opts = {}) => {
  calls.push({ url: decodeURIComponent(url.replace(/\+/g, " ")), raw: url, method: opts.method || "GET", body: opts.body || "" });
  return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => [] };
};
process.env.SUPABASE_SERVICE_KEY = "test-key";

const dbPath = path.join(ROOT, "lib", "db.js");
delete require.cache[require.resolve(dbPath)];
const { q } = require(dbPath);
const last = () => calls[calls.length - 1] || { url: "", method: "", body: "" };
const reset = () => { calls.length = 0; };

(async () => {
  /* 1) like لا يسقط: dayHasPublish كانت تعيد true دائمًا */
  reset();
  await q(`select id from publish_queue where user_id=$1 and video_path like $2 and status='published' limit 1`,
    ["u1", "%/autopilot/2026-11-12-%"]);
  chk("like يصل إلى PostgREST (لا يُسقط)", /video_path=like\./.test(last().url) && /autopilot/.test(last().url), last().url);

  /* 2) any($1::uuid[]) ⇒ in.(…) وليس PATCH بلا فلتر */
  reset();
  await q(`update publish_queue set status='draft', error=$2 where id = any($1::uuid[])`,
    [["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"], "صفّ مكرر"]);
  chk("any($1::uuid[]) ⇒ in.(…) مقيَّد بالمعرّفات",
    /id=in\.\(/.test(last().url) && /11111111/.test(last().url) && /22222222/.test(last().url), last().url);
  chk("لا PATCH بلا فلتر إطلاقًا", !/\?(select=.*)?$/.test(last().url.replace(/^.*\?/, "?")), last().url);

  /* 3) الصبغة ::jsonb لا تُسقط العمود */
  reset();
  await q(`insert into system_checks (kind, ok, detail) values ('reauth_needed', false, $1::jsonb)`,
    [{ platform: "youtube", error: "invalid_grant" }]);
  const body = JSON.parse(last().body || "{}");
  chk("INSERT يحفظ ok وdetail (لا يسقطهما)",
    body.kind === "reauth_needed" && body.ok === false && body.detail && body.detail.platform === "youtube",
    last().body);

  reset();
  await q(`insert into system_checks (kind, ok, detail) values ('reauth_needed', false, $1::jsonb)`,
    [JSON.stringify({ platform: "youtube", connection_id: "c1" })]);
  chk("نص ::jsonb يتحول لكائن لا نص مزدوج", JSON.parse(last().body).detail.connection_id === "c1", last().body);
  let badJson = false;
  try { await q(`insert into system_checks (kind, ok, detail) values ('reauth_needed', false, $1::jsonb)`, ["not-json"]); }
  catch { badJson = true; }
  chk("نص jsonb غير الصالح يُرفض", badJson);

  /* 4) <> و now() - interval */
  reset();
  await q(`update autopilot_runs set status='published', external_url=$3, error=null, completed_at=now()
           where user_id=$1 and run_date=$2 and status <> 'published'`, ["u1", "2026-11-12", "https://youtu.be/x"]);
  chk("<> يُترجم إلى neq", /status=neq\.published/.test(last().url) && /user_id=eq\.u1/.test(last().url), last().url);

  reset();
  await q(`update autopilot_runs set status='failed' where status='rendering' and created_at < now() - interval '20 minutes'`);
  chk("now() - interval يصل كوقت فعلي",
    /created_at=lt\.\d{4}-\d{2}-\d{2}T/.test(last().url) && /status=eq\.rendering/.test(last().url), last().url);

  /* 5) nulls last في الترتيب */
  reset();
  await q(`select id from publish_queue where status='failed' order by publish_at asc nulls last limit 5`);
  chk("nulls last يصل إلى order", /order=publish_at\.asc\.nullslast/.test(last().url) && /limit=5/.test(last().url), last().url);

  /* 6) شرط غير مفهوم ⇒ خطأ صريح (لا تجاهل) */
  let threw = null;
  try { await q(`update publish_queue set status='draft' where id = (select id from publish_queue limit 1)`); }
  catch (e) { threw = e; }
  chk("الشرط غير المفهوم يُطلق خطأً بدل أن يُسقط", Boolean(threw) && /غير مدعومة/.test(threw.message), String(threw && threw.message));

  /* 7) لا UPDATE/DELETE بلا شرط */
  let threw2 = null;
  try { await q(`update publish_queue set status='draft'`); } catch (e) { threw2 = e; }
  chk("UPDATE بلا WHERE مرفوض", Boolean(threw2), String(threw2 && threw2.message));
  let threw3 = null;
  try { await q(`delete from publish_queue`); } catch (e) { threw3 = e; }
  chk("DELETE بلا WHERE مرفوض", Boolean(threw3), String(threw3 && threw3.message));

  /* 8) is null / not is null */
  reset();
  await q(`select id from publish_queue where external_url is null limit 2`);
  chk("is null يُترجم", /external_url=is\.null/.test(last().url), last().url);

  /* 9) select بسيط لا تعبيرات SQL (PostgREST يرفض التعبيرات) */
  const listSrc = fs.readFileSync(path.join(ROOT, "lib", "soc_list.js"), "utf8");
  chk("soc_list يقرأ أعمدة صريحة (لا تعبير في select)",
    /select [^`]*from social_connections/.test(listSrc) && !/as has_refresh/.test(listSrc),
    "تعبير select يُرجع 400 من PostgREST");

  /* 10) فحص ثابت: كل q()/q1() في lib وapi قابل للترجمة */
  const files = [];
  for (const d of ["lib", "api"]) {
    for (const f of fs.readdirSync(path.join(ROOT, d))) if (f.endsWith(".js")) files.push(path.join(d, f));
  }
  const skipped = [];
  const bad = [];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    const re = /\bq1?\(\s*`([^`]+)`/g;
    let m;
    while ((m = re.exec(src))) {
      const sql = m[1].replace(/\s+/g, " ").trim();
      if (/\$\{/.test(sql)) { skipped.push({ rel, sql }); continue; }
      const dummy = Array.from({ length: 12 }, (_, i) => (i === 0 ? "11111111-1111-1111-1111-111111111111" : "x"));
      for (const m of sql.matchAll(/\$(\d+)::jsonb/gi)) dummy[Number(m[1]) - 1] = '{}';
      reset();
      try {
        await q(sql, dummy);
      } catch (e) {
        if (e.code === "UNSUPPORTED" || /غير مدعومة|غير مفهوم/.test(String(e.message))) {
          bad.push({ rel, sql: sql.slice(0, 140), why: e.message });
        }
      }
    }
  }
  chk(`كل استعلامات q() المثبتة قابلة للترجمة (${bad.length} مشكلة)`,
    bad.length === 0, bad.map((b) => `\n     ${b.rel}: ${b.sql} ⇒ ${b.why}`).join(""));
  chk("لا استعلامات مُقحمة بـ${…} في WHERE/SET (عدا المفحوصة يدويًا)",
    skipped.length === 0, skipped.map((s) => `\n     ${s.rel}: ${s.sql.slice(0, 120)}`).join(""));

  console.log(errs.length ? `ERRORS ${errs.length}` : `ALL OK (${pass} checks)`);
  if (errs.length) console.log(errs.map((e) => " - " + e).join("\n"));
  process.exit(errs.length ? 1 : 0);
})().catch((e) => { console.log("FAIL استثناء غير متوقع: " + (e && e.message)); process.exit(1); });

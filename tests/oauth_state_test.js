#!/usr/bin/env node
/* ============================================================
 * اختبار حالة OAuth (كوكي التفويض) — سبب فشل «لم يكتمل ربط youtube_err»
 * ------------------------------------------------------------
 * الكوكي كان يخزّن التوقيع HMAC فقط بلا الحمولة، فكان readStCookie يعيد
 * null دائمًا ⇒ كل ربط (يوتيوب/ميتا/تيك توك/X) ينتهي بـ linked=*_err
 * مهما فعل المستخدم. هنا نثبّت: (أ) الذهاب والعودة للكوكي، (ب) رفض
 * التلاعب، (ج) أن كل مزوّد يشرح سبب الفشل في ?w= بدل رسالة عامة.
 *
 * التشغيل: node tests/oauth_state_test.js   (يفشل بـ exit 1 عند أي خطأ)
 * ============================================================ */
process.env.TOKEN_ENC_KEY = process.env.TOKEN_ENC_KEY || "test-key-for-oauth-state";
process.env.SITE_ORIGIN = process.env.SITE_ORIGIN || "https://example.test";

const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..");

let pass = 0;
const errs = [];
const ok = (m) => { pass++; console.log("OK   " + m); };
const fail = (m) => { errs.push(m); console.log("FAIL " + m); };
const chk = (name, cond, extra = "") => (cond ? ok(name) : fail(name + (extra ? " :: " + extra : "")));

/* بديل الجلسة: handleStart يقرأ المستخدم من getUserId */
const sessPath = require.resolve(path.join(ROOT, "lib", "sess.js"));
require.cache[sessPath] = { id: sessPath, filename: sessPath, loaded: true, exports: { getUserId: async () => "user-42" } };
/* بديل قاعدة البيانات: نسجّل ما يُكتب في social_connections بلا شبكة */
const dbCalls = [];
const dbPath = require.resolve(path.join(ROOT, "lib", "db.js"));
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: {
    q: async (sql, params) => { dbCalls.push({ sql, params }); return []; },
    q1: async () => null,
    rest: async () => [],
  },
};
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "test-client-secret";

const O = require(path.join(ROOT, "lib", "oauth.js"));

/* ---------------- أدوات محاكاة ---------------- */
const mkRes = () => {
  const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; }, end() { this.ended = true; } };
  return res;
};
const cookieOnly = (setCookie) => String(setCookie).split(";")[0];
const reqWith = (cookie) => ({ headers: cookie ? { cookie } : {}, url: "/api/oauth/callback" });

(async () => {
  /* 1) كوكي الحالة: حمولة + توقيع */
  const res1 = mkRes();
  const header = O.setStCookie(res1, "youtube", "user-1", "youtube.nonce-abc", {});
  const parts = String(header).split(";").map((s) => s.trim());
  chk("الكوكي باسم qr_youtube_st", parts[0].startsWith("qr_youtube_st="), parts[0].slice(0, 30));
  chk("الكوكي محمي (HttpOnly + Secure + SameSite=Lax + Path)",
    /HttpOnly/i.test(header) && /Secure/i.test(header) && /SameSite=Lax/i.test(header) && /Path=\/api\/oauth/.test(header));
  const value = cookieOnly(header).split("=")[1];
  chk("القيمة تحمل حمولة وتوقيعًا (جزءان)", String(value).split(".").length === 2, String(value).slice(0, 24) + "…");

  const req1 = reqWith(cookieOnly(header));
  const st1 = O.readStCookie(req1, "youtube");
  chk("readStCookie يعيد الحمولة (كانت تعيد null دائمًا)",
    Boolean(st1) && st1.u === "user-1" && st1.n === "youtube" && st1.r === "youtube.nonce-abc", JSON.stringify(st1));
  chk("stCookieValid يقبل كوكي سليمًا", Boolean(st1) && O.stCookieValid(req1, "youtube", st1) === true);

  /* 2) منع التلاعب */
  const [pay, sig] = String(value).split(".");
  const forged = Buffer.from(JSON.stringify({ n: "youtube", u: "victim", r: "youtube.nonce-abc", m: {}, t: Date.now() }), "utf8").toString("base64url");
  const reqForged = reqWith(`qr_youtube_st=${forged}.${sig}`);
  const stForged = O.readStCookie(reqForged, "youtube");
  chk("تغيير الحمولة يُرفض بالتوقيع", Boolean(stForged) && O.stCookieValid(reqForged, "youtube", stForged) === false);
  const reqBadSig = reqWith(`qr_youtube_st=${pay}.${sig.slice(0, -2)}AA`);
  const stBad = O.readStCookie(reqBadSig, "youtube");
  chk("تغيير التوقيع يُرفض", !stBad || O.stCookieValid(reqBadSig, "youtube", stBad) === false);
  chk("كوكي بلا توقيع لا يُقرأ", O.readStCookie(reqWith(`qr_youtube_st=${pay}`), "youtube") === null);
  chk("كوكي منصة أخرى لا يُقرأ", O.readStCookie(reqWith(`qr_tiktok_st=${pay}.${sig}`), "youtube") === null);

  /* 3) كل مزوّد يشرح سبب فشله في ?w= */
  const CBs = {
    youtube: require(path.join(ROOT, "lib", "cb_youtube.js")),
    meta: require(path.join(ROOT, "lib", "cb_meta.js")),
    tiktok: require(path.join(ROOT, "lib", "cb_tiktok.js")),
    x: require(path.join(ROOT, "lib", "cb_x.js")),
  };
  for (const [name, cb] of Object.entries(CBs)) {
    const r = mkRes();
    await cb({ url: `/api/oauth/callback?state=${name}.abc`, headers: {} }, r);
    const loc = String(r.headers.location || "");
    chk(`${name}: بلا رمز تفويض ⇒ *_err مع سبب no_code`,
      r.statusCode === 302 && loc.includes(`linked=${name}_err`) && /[?&]w=no_code/.test(loc), loc);

    const r2 = mkRes();
    await cb({ url: `/api/oauth/callback?code=abc&state=${name}.abc`, headers: {} }, r2);
    const loc2 = String(r2.headers.location || "");
    chk(`${name}: بلا كوكي حالة ⇒ سبب state`,
      r2.statusCode === 302 && /[?&]w=state/.test(loc2), loc2);

    const r3 = mkRes();
    await cb({ url: `/api/oauth/callback?error=access_denied&state=${name}.abc`, headers: {} }, r3);
    const loc3 = String(r3.headers.location || "");
    chk(`${name}: رفض المستخدم/التطبيق ⇒ سبب denied`, /[?&]w=denied/.test(loc3), loc3);
  }

  /* 5) من البداية للنهاية: زر الربط ← جوجل ← العودة ← صف مربوط في القاعدة */
  const startRes = mkRes();
  await O.handleStart({ url: "/api/gw?op=start&p=youtube", headers: {} }, startRes, "youtube");
  const authUrl = new URL(String(startRes.headers.location || "https://x.invalid/"));
  const state = authUrl.searchParams.get("state") || "";
  const startCookie = String(startRes.headers["set-cookie"] || "");
  chk("بدء الربط يحوّل لجوجل بحالة تبدأ بـ youtube.",
    startRes.statusCode === 302 && /accounts\.google\.com/.test(authUrl.host + authUrl.pathname) && /^youtube\./.test(state), state.slice(0, 18));
  chk("بدء الربط يضبط كوكي الحالة مع التحويل", /qr_youtube_st=/.test(startCookie));

  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes("oauth2.googleapis.com/token")) return { ok: true, json: async () => ({ access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 }) };
    if (u.includes("youtube/v3/channels")) return { ok: true, json: async () => ({ items: [{ id: "UC123", snippet: { title: "قناة اختبار" } }] }) };
    return { ok: false, json: async () => ({}) };
  };
  const YT = require(path.join(ROOT, "lib", "cb_youtube.js"));
  const cbRes = mkRes();
  await YT({ url: `/api/oauth/callback?code=auth-code-1&state=${encodeURIComponent(state)}`, headers: { cookie: cookieOnly(startCookie) } }, cbRes);
  const cbLoc = String(cbRes.headers.location || "");
  chk("العودة من جوجل تكمل الربط بنجاح (كانت تفشل دائمًا)", cbLoc === "/#/account?linked=youtube", cbLoc);
  const ins = dbCalls.find((c) => /insert into social_connections/i.test(c.sql));
  chk("يُكتب صف social_connections للمستخدم صاحب الكوكي",
    Boolean(ins) && String(ins.sql).includes("'youtube'") && ins.params[0] === "user-42" && ins.params[2] === "قناة اختبار",
    JSON.stringify(ins && { u: ins.params[0], name: ins.params[2] }));
  chk("التوكن يُخزَّن مشفّرًا لا خامًا",
    Boolean(ins) && String(ins.params[4]) !== "at-1" && /^[A-Za-z0-9_-]{30,}$/.test(String(ins.params[4])));

  const cbBad = mkRes();
  await YT({ url: `/api/oauth/callback?code=auth-code-2&state=youtube.other`, headers: { cookie: cookieOnly(startCookie) } }, cbBad);
  chk("حالة لا تطابق الكوكي تُرفض بسبب state", /linked=youtube_err&w=state/.test(String(cbBad.headers.location || "")), String(cbBad.headers.location || ""));

  /* 6) الرسالة في الواجهة تشرح السبب ولا تعرض الاسم الخام */
  const pub = fs.readFileSync(path.join(ROOT, "public", "js", "publish.js"), "utf8");
  chk("publish.js يزيل _err من الاسم", /replace\(\/_err\$\/, ?""\)/.test(pub) || /REASONS|WHY/.test(pub));
  chk("publish.js يقرأ ?w= ويشرحه", /[?&]w=/.test(pub) && /WHY\s*=/.test(pub) && /denied:/.test(pub) && /state:/.test(pub));
  chk("لا رسالة عامة فقط بعد الآن", !/⚠️ لم يكتمل ربط \$\{label\}\. أعد المحاولة/.test(pub));

  console.log(errs.length ? `ERRORS ${errs.length}` : `ALL OK (${pass} checks)`);
  if (errs.length) console.log(errs.map((e) => " - " + e).join("\n"));
  process.exit(errs.length ? 1 : 0);
})().catch((e) => {
  console.log("FAIL استثناء غير متوقع: " + (e && e.message));
  process.exit(1);
});

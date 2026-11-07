#!/usr/bin/env node
/* ============================================================
 * اختبار واجهة الدخول (jsdom) — زر «دخول» يجب أن يفتح نافذة دخول فعلية.
 * ------------------------------------------------------------
 * العطل الذي كشفه المستخدم: «لما أدخل كلمة دخول ما يحولني على صفحة تسجيل الدخول».
 * السبب: #authBtn بلا مستمع نقر، ونافذة #loginOverlay غير موجودة في الماركب،
 * والربط القديم (openLogin/magicLink/google) ضاع مع استبدال صفحة الحساب.
 *
 * يغطي:
 *   1) العناصر الخمسة موجودة في الصفحة الحقيقية.
 *   2) النقر على «دخول» يفتح النافذة.
 *   3) إرسال بريد صحيح → QRAuth.magicLink(البريد) وإغلاق النافذة.
 *   4) بريد خاطئ → لا طلب، ورسالة خطأ.
 *   5) «المتابعة بجوجل» → QRAuth.google().
 *   6) تسجيل الدخول (حدث QRAuth) يغيّر نص الزر إلى «حسابي».
 *   7) Esc / زر الإغلاق يغلقان النافذة.
 *
 * التشغيل: NODE_PATH=/tmp/jt/node_modules node tests/login_ui_test.js
 * ============================================================ */
const fs = require("fs");
const path = require("path");

let JSDOM;
try { ({ JSDOM } = require("jsdom")); }
catch {
  console.log("WARN تخطّي اختبار الدخول: jsdom غير مثبّت (npm i --no-save jsdom)");
  process.exit(0);
}

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
const publishSrc = fs.readFileSync(path.join(ROOT, "public", "js", "publish.js"), "utf8");

let pass = 0;
const errs = [];
const ok = (m) => { pass++; console.log("OK   " + m); };
const fail = (m) => { errs.push(m); console.log("FAIL " + m); };
const chk = (n, c, x = "") => (c ? ok(n) : fail(n + (x ? " :: " + x : "")));

const dom = new JSDOM(html, { url: "https://quran-reels-tau.vercel.app/", runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;
const d = window.document;

/* بدائل: لا شبكة ولا Supabase */
const calls = { magic: [], google: 0 };
const listeners = [];
let currentUser = null;
window.QRAuth = {
  user: () => currentUser,
  token: async () => (currentUser ? "t" : null),
  magicLink: async (email) => { calls.magic.push(email); return true; },
  google: () => { calls.google++; },
  on: (cb) => { listeners.push(cb); return cb; },
  ensure: async () => null,
  boot: () => {},
};
const accountPayload = {
  config: { enabled: false, at_utc: "04:15:00", platforms: ["youtube"], template: {} },
  runs: [], connected: false, platforms: [], channel: "لا توجد قنوات مرتبطة",
  reciters: [{ id: "r1", name: "قارئ" }],
  available: [{ key: "youtube", name: "يوتيوب", publish: true }, { key: "linkedin", name: "لينكد إن", publish: false }],
  articles: { count: 500 },
};
window.fetch = async (url) => {
  const pathname = String(url);
  if (pathname.includes("/api/app-config")) return { ok: true, json: async () => ({ supabase: { url: "", anon: "" } }) };
  if (pathname.includes("/api/autopilot")) return { ok: true, json: async () => accountPayload };
  return { ok: true, json: async () => ({}) };
};
window.alert = () => {};

window.eval(publishSrc);

/* 1) العناصر موجودة */
const ids = ["authBtn", "loginOverlay", "loginEmail", "loginSubmit", "loginGoogle", "loginClose"];
const missing = ids.filter((id) => !d.getElementById(id));
chk("عناصر الدخول الخمسة موجودة في index.html", missing.length === 0, "ناقص: " + missing.join(", "));

/* ربط الواجهة (bootAccount يستدعيه عند DOMContentLoaded) */
window.QRAuthUI.wire();

const overlay = () => d.getElementById("loginOverlay");

/* 2) النقر على «دخول» يفتح النافذة */
chk("النافذة مغلقة قبل النقر", overlay().hidden === true);
d.getElementById("authBtn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
chk("النقر على «دخول» يفتح نافذة الدخول", overlay().hidden === false);

/* 4) بريد خاطئ → لا طلب */
d.getElementById("loginEmail").value = "not-an-email";
d.getElementById("loginSubmit").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
chk("بريد خاطئ لا يُرسل طلب رابط سحري", calls.magic.length === 0);
chk("البريد الخاطئ يُبقي النافذة مفتوحة للتصحيح", overlay().hidden === false);

/* 3) بريد صحيح → magicLink ثم إغلاق */
d.getElementById("loginEmail").value = "user@example.com";
d.getElementById("loginSubmit").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

/* 7) إعادة الفتح ثم Esc */
d.getElementById("authBtn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
d.getElementById("loginEmail").value = "";
d.getElementById("loginClose").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
chk("زر الإغلاق يغلق النافذة", overlay().hidden === true);

d.getElementById("authBtn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
d.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
chk("Esc يغلق النافذة", overlay().hidden === true);

/* 5) جوجل */
d.getElementById("authBtn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
d.getElementById("loginGoogle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
chk("«المتابعة بجوجل» تنادي QRAuth.google()", calls.google === 1);

/* 6) بعد الدخول: نص الزر + إغلاق النافذة */
currentUser = { id: "u1", email: "user@example.com" };
listeners.forEach((cb) => cb(currentUser));
chk("بعد تسجيل الدخول يصبح نص الزر «حسابي»", /حسابي/.test(d.getElementById("authBtn").textContent), d.getElementById("authBtn").textContent);
chk("تسجيل الدخول يغلق نافذة الدخول", overlay().hidden === true);

/* النقر بعد الدخول يوجّه إلى لوحة الحساب لا إلى نافذة الدخول */
d.getElementById("authBtn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
chk("النقر بعد الدخول يوجّه إلى #/account", window.location.hash === "#/account", window.location.hash);
chk("ولا يفتح نافذة الدخول مجددًا", overlay().hidden === true);

setTimeout(() => {
  chk("إرسال البريد الصحيح نادى QRAuth.magicLink بالبريد", calls.magic.length === 1 && calls.magic[0] === "user@example.com", JSON.stringify(calls.magic));
  chk("إرسال البريد الصحيح أغلق النافذة", overlay().hidden === true);
  console.log(errs.length ? `ERRORS ${errs.length}` : `ALL OK (${pass} checks)`);
  if (errs.length) console.log(errs.map((e) => " - " + e).join("\n"));
  process.exit(errs.length ? 1 : 0);
}, 50);

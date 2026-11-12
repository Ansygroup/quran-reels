#!/usr/bin/env node
/* ============================================================
 * حاجز ربط القنوات (OAuth) — «ربط القنوات مش شغال»
 * ------------------------------------------------------------
 * العطل الحقيقي (7 نوفمبر 2026): الخادم يملك المسارات كاملة
 * (op=start/list/disconnect في api/gw.js) لكن لا يوجد في أي صفحة زر واحد
 * يستدعيها، ولا حتى تعريف QRPublish الذي تناديه app.js و creator.js.
 * فأول ما يفعله زر «الحساب» أن يفتح صفحة فارغة: لا قنوات، لا أزرار ربط،
 * ولا شيء يحدث عند الضغط.
 *
 * هذا الملف يفحص:
 *  1) وجود أزرار الربط/الفك ومساراتها في الواجهة (بوابات ثابتة).
 *  2) وجود QRPublish ودواله الأربع التي تناديها app.js.
 *  3) سلوكًا فعليًا في jsdom: صفحة الحساب تُبنى، المنصة المرتبطة تظهر مع
 *     «فك الربط»، وغير المرتبطة تظهر مع «اربط»، ورابط البدء صحيح.
 *
 * التشغيل: node tests/account_connect_test.js   (داخل npm test)
 * ============================================================ */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

let pass = 0;
const errs = [];
const ok = (m) => { pass++; console.log("OK   " + m); };
const fail = (m) => { errs.push(m); console.log("FAIL " + m); };
const chk = (n, c, x = "") => (c ? ok(n) : fail(n + (x ? " :: " + x : "")));

const publish = read("public/js/publish.js");
const app = read("public/js/app.js");
const index = read("public/index.html");
const start = read("api/_oauth_start.js");
const oauth = read("lib/oauth.js");

/* ---------- 1) الواجهة تستدعي مسارات الربط الثلاثة ---------- */
chk("الواجهة تبدأ الربط (op=start)", /op=start&p=/.test(publish), "لا يوجد رابط بدء ربط في publish.js");
chk("الواجهة تقرأ الحسابات المرتبطة (op=list)", /op=list/.test(publish));
chk("الواجهة تفك الربط (op=disconnect)", /op=disconnect/.test(publish));
chk("بطاقة الحسابات المرتبطة موجودة في الماركب (#acctAccounts)", /id="acctAccounts"/.test(index) && /id="acctAccountsList"/.test(index));
chk("نسخة publish.js مرفوعة في الماركب (?v=28)", /publish\.js\?v=28/.test(index));

/* ---------- 2) QRPublish موجودة بدوالها (نداءات app.js/creator.js) ---------- */
chk("window.QRPublish مُعرَّف (كان undefined فتُهمل كل النداءات)", /window\.QRPublish\s*=\s*window\.PublishApp/.test(publish));
for (const fn of ["refreshAccount", "afterLogin", "wireGlobals", "scheduleFromExport"]) {
  const called = new RegExp(`QRPublish\\.${fn}`).test(app) || new RegExp(`QRPublish\\.${fn}`).test(read("public/js/creator.js"));
  const defined = new RegExp(`\\b${fn}\\s*\\(`).test(publish);
  chk(`QRPublish.${fn}: يُنادى${called ? "" : " (غير مُنادَى)"} ومُعرَّف`, defined, "الدالة غير موجودة في publish.js");
}

/* ---------- 3) العودة من المزوّد تُهيّئ الصفحة (#/account?linked=…) ---------- */
chk("bootAccount يقبل #/account مع باراميتر", /#\\\/account\(\\\?\|\$\)/.test(publish) || /#\/account\(\\\?/.test(publish));
chk("الواجهة تتعامل مع linked= (رسالة نجاح/فشل)", /linked=/.test(publish) && /reportLinkedFlag/.test(publish));

/* ---------- 4) الخادم: أسماء بديلة + عدم تسريب التوكن ---------- */
chk("‏_oauth_start يقبل facebook/instagram (مفتاح meta)", /facebook[\s\S]{0,80}instagram[\s\S]{0,40}meta/.test(start));
chk("‏302 من بدء الربط يحمل Referrer-Policy: no-referrer", /Referrer-Policy/.test(oauth) && /no-referrer/.test(oauth));

/* ---------- 5) سلوك فعلي في jsdom (يُتخطّى إن لم تُثبَّت) ---------- */
let JSDOM = null;
try { ({ JSDOM } = require("jsdom")); } catch { /* اختياري */ }
if (!JSDOM) {
  console.log("SKIP فحص DOM (jsdom غير مثبّت في هذه البيئة)");
} else {
  (async () => {
    const dom = new JSDOM(index, { url: "https://quran-reels-tau.vercel.app/#/account", runScripts: "outside-only", pretendToBeVisual: true });
    const { window } = dom;
    window.scrollTo = () => {};
    window.confirm = () => true;

    const fetched = [];
    const json = (o) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(o) });
    window.fetch = (url) => {
      fetched.push(String(url));
      if (String(url).includes("/api/gw?op=list")) {
        return json({ connections: [
          { id: "conn-1", platform: "youtube", account_name: "Psychology World", expires_at: 1793878001416, has_refresh: false },
        ] });
      }
      if (String(url).includes("/api/autopilot")) {
        return json({ config: {}, runs: [], connected: true, platforms: ["youtube"], channel: "يوتيوب · Psychology World",
          reciters: [], available: [
            { key: "youtube", name: "يوتيوب", publish: true, connect: "youtube", ready: true },
            { key: "tiktok", name: "تيك توك", publish: true, connect: "tiktok", ready: true },
            { key: "facebook", name: "فيسبوك", publish: true, connect: "meta", ready: false },
            { key: "linkedin", name: "لينكد إن", publish: false, connect: null, ready: false },
          ], articles: { count: 7993 } });
      }
      return json({});
    };
    window.AuthApp = { getUserId: async () => "u1", getToken: async () => "TOKEN123" };

    // نُحمّل publish.js داخل النافذة (بلا require/تنفيذ شبكي)
    window.eval(publish);
    const P = window.PublishApp;
    let stErr = null;
    try { await P.init(); } catch (e) { stErr = e; }
    chk("init() لا يرمي استثناءً", !stErr, stErr && String(stErr.message).slice(0, 90));
    chk("يُطلب op=list عند فتح الحساب", fetched.some((u) => u.includes("/api/gw?op=list")), fetched.join(" · "));

    const card = window.document.getElementById("acctAccounts");
    chk("بطاقة الحسابات المرتبطة تُعرض", Boolean(card && !card.hidden));
    const yt = window.document.querySelector('[data-soc="youtube"]');
    chk("يوتيوب يظهر «مرتبط» باسم القناة", Boolean(yt && /Psychology World/.test(yt.textContent)));
    chk("يوتيوب به زر «فك الربط» يحمل معرّف الاتصال",
      Boolean(window.document.querySelector('[data-soc="youtube"] [data-unlink="conn-1"]')));
    const tt = window.document.querySelector('[data-soc="tiktok"] [data-connect="tiktok"]');
    chk("تيك توك (غير مرتبط) يظهر له زر «اربط»", Boolean(tt && /اربط/.test(tt.textContent)));
    const li = window.document.querySelector('[data-soc="linkedin"]');
    chk("لينكد إن يظهر «قريبًا» بلا زر ربط", Boolean(li && /قريبًا/.test(li.textContent)));

    /* جلسة منتهية: البطاقة كانت تعرض «مرتبط» بلا تحذير رغم أن النشر يفشل بـinvalid_grant */
    chk("اتصال بلا توكن تجديد يُنبّه بغياب تصريح التجديد", Boolean(yt && /تصريح التجديد غير متاح/.test(yt.textContent)), yt && yt.textContent.slice(0, 80));
    chk("الخادم يبلّغ has_refresh منطقيًا (بلا توكن)", /has_refresh/.test(fs.readFileSync(path.join(ROOT, "lib", "soc_list.js"), "utf8")));
    chk("التحذير لا يعتمد على انتهاء access_token وحده", /has_refresh === false/.test(fs.readFileSync(path.join(ROOT, "public", "js", "publish.js"), "utf8")));
    chk("يوتيوب المنتهي يعرض «إعادة الربط»", Boolean(window.document.querySelector('[data-soc="youtube"] [data-connect="youtube"]')));

    /* مزوّد غير مهيأ (META_APP_ID/SECRET غائبة في Vercel): زر معطّل وسبب واضح */
    const fb = window.document.querySelector('[data-soc="facebook"]');
    chk("فيسبوك غير المهيأ يظهر بسبب واضح", Boolean(fb && /غير مهيأ/.test(fb.textContent)), fb && fb.textContent.slice(0, 90));
    chk("فيسبوك غير المهيأ: الزر معطّل (لا رابط ميت)", Boolean(fb && fb.querySelector("button[disabled]")));
    chk("فيسبوك غير المهيأ: لا يحمل data-connect", Boolean(fb && !fb.querySelector("[data-connect]")));

    chk("زر «🎬 اختبار توليد فيديو» يُعرض في الإجراءات السريعة",
      Boolean(window.document.getElementById("quickRenderTest")));
    chk("connectPath صحيح ليوتيوب", P.connectPath("youtube", "T") === "/api/gw?op=start&p=youtube&t=T", P.connectPath("youtube", "T"));
    chk("connectPath يحوّل instagram إلى meta", P.connectPath("instagram", "T") === "/api/gw?op=start&p=meta&t=T", P.connectPath("instagram", "T"));
    chk("connectPath يعيد null لمنصة بلا ربط", P.connectPath("linkedin", "T") === null);
    chk("connectPath يعيد null بلا توكن", P.connectPath("youtube", "") === null);

    /* ---------- العودة من الخادم بـ?setup=meta (مفاتيح ناقصة) ---------- */
    const dom2 = new JSDOM(index, { url: "https://quran-reels-tau.vercel.app/#/account?setup=meta", runScripts: "outside-only", pretendToBeVisual: true });
    const w2 = dom2.window;
    w2.scrollTo = () => {};
    w2.fetch = (url) => {
      if (String(url).includes("/api/gw?op=list")) return json({ connections: [] });
      return json({ config: {}, runs: [], connected: false, platforms: [], reciters: [], available: [], articles: { count: 7993 } });
    };
    w2.AuthApp = { getUserId: async () => "u1", getToken: async () => "T" };
    w2.eval(publish);
    let e2 = null;
    try { await w2.PublishApp.init(); } catch (e) { e2 = e; }
    const notice2 = w2.document.getElementById("acctNotice");
    chk("init() مع ?setup=meta لا يرمي", !e2, e2 && String(e2.message).slice(0, 80));
    chk("رسالة ?setup تشرح المفاتيح الناقصة", Boolean(notice2 && /غير مهيأ/.test(notice2.textContent)), notice2 && notice2.textContent.slice(0, 90));
    chk("رسالة ?setup تذكر الربط المتاح (يوتيوب)", Boolean(notice2 && /يوتيوب/.test(notice2.textContent)));

    console.log(errs.length ? `ERRORS ${errs.length}` : `ALL OK (${pass} checks)`);
    if (errs.length) console.log(errs.map((e) => " - " + e).join("\n"));
    process.exit(errs.length ? 1 : 0);
  })();
}

/* في حال غياب jsdom نُنهي بعد الفحوص الثابتة */
if (!JSDOM) {
  console.log(errs.length ? `ERRORS ${errs.length}` : `ALL OK (${pass} checks)`);
  if (errs.length) console.log(errs.map((e) => " - " + e).join("\n"));
  process.exit(errs.length ? 1 : 0);
}

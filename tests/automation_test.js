#!/usr/bin/env node
/* ============================================================
 * «اربط وخلاص» — أتمتة تدوم وحدها
 * ------------------------------------------------------------
 * الدرس (2026-11-13):
 *   • الربط عبر OAuth لم يكن يُنشئ إعداد أتمتة، فالمستخدم يربط قناته ويظن أن
 *     الموقع سينشر تلقائيًا… ولا شيء يحدث حتى يضغط «حفظ الإعدادات».
 *   • `runDailyAutopilots` كانت `order by updated_at asc limit 3` ثابتة ⇒ نفس
 *     ثلاثة مستخدمين كل يوم، والخامس لا يُخدَم أبدًا.
 *   • اختيار القارئ كان مثبتًا على «تدوير» في parseTemplate فلا يمكن تخصيصه.
 *
 * التشغيل: node tests/automation_test.js
 * ============================================================ */
const path = require("path");
const fs = require("fs");
const Module = require("module");

const ROOT = path.join(__dirname, "..");
let pass = 0;
const errs = [];
const ok = (m) => { pass++; console.log("OK   " + m); };
const fail = (m) => { errs.push(m); console.log("FAIL " + m); };
const chk = (n, c, extra = "") => (c ? ok(n) : fail(n + (extra ? " :: " + extra : "")));

const STUBS = {
  "@sparticuz/chromium": { default: { executablePath: async () => "/bin/true", args: [], headless: true } },
  "playwright-core": { chromium: { launch: async () => ({ newPage: async () => ({}), close: async () => {} }) } },
  playwright: {},
};
const origLoad = Module._load;
Module._load = function (request) {
  if (Object.prototype.hasOwnProperty.call(STUBS, request)) return STUBS[request];
  return origLoad.apply(this, arguments);
};

/* ---- بديل قاعدة البيانات ---- */
const sql = [];
const restCalls = [];
let rowsFor = () => [];
let restRows = [];
let rpcOutcome = "created";
let rpcFailure = false;
const dbStub = {
  q: async (text, params) => { sql.push({ text, params }); return rowsFor(text, params); },
  q1: async (text, params) => { const r = await rowsFor(text, params); return Array.isArray(r) && r.length ? r[0] : null; },
  rest: async (p, opts) => { restCalls.push({ p: String(p), method: (opts && opts.method) || "GET", body: opts?.body }); if (String(p).includes("/rpc/link_autopilot_platform_guarded")) { if (rpcFailure) throw new Error("db down"); return rpcOutcome; } return restRows; },
};
require.cache[require.resolve(path.join(ROOT, "lib", "db.js"))] = { id: "db", filename: "db", loaded: true, exports: dbStub };
require.cache[require.resolve(path.join(ROOT, "lib", "publish.js"))] = {
  id: "publish", filename: "publish", loaded: true,
  exports: { publishRow: async () => ({ ok: true }), videoUrl: () => "", pickConnection: () => null },
};

const A = require(path.join(ROOT, "lib", "autopilot.js"));
const T = A.__test;
const reset = () => { sql.length = 0; restCalls.length = 0; rowsFor = () => []; restRows = []; rpcOutcome = "created"; rpcFailure = false; };

(async () => {
  /* 1) إعداد الأتمتة يُنشأ تلقائيًا عند أول ربط */
  chk("enableDefaultAutomation متاحة", typeof A.enableDefaultAutomation === "function" && typeof T.enableDefaultAutomation === "function");
  reset();
  const created = await A.enableDefaultAutomation("u1", "youtube");
  const rpc = restCalls[0];
  const args = JSON.parse(rpc.body);
  chk("أول ربط يستخدم RPC ذريًا", created === "created" && rpc.p.includes("/rpc/link_autopilot_platform_guarded") && args.p_user_id === "u1" && args.p_platform === "youtube");
  reset(); rpcOutcome = "extended";
  chk("ربط منصة جديدة يوسّع المنصات", await A.enableDefaultAutomation("u1", "tiktok") === "extended" && JSON.parse(restCalls[0].body).p_platform === "tiktok");
  reset(); rpcOutcome = "unchanged";
  chk("إعادة الربط تحترم اختيار المستخدم", await A.enableDefaultAutomation("u1", "youtube") === "unchanged");
  reset(); rpcFailure = true;
  chk("فشل القاعدة لا يُفشل الربط", await A.enableDefaultAutomation("u1", "youtube") === "error");

  /* 5) كل ردود OAuth تُفعّل الأتمتة بعد الربط */
  for (const f of ["cb_youtube.js", "cb_meta.js", "cb_tiktok.js", "cb_x.js"]) {
    const src = fs.readFileSync(path.join(ROOT, "lib", f), "utf8");
    chk(`${f}: يُفعّل الأتمتة بعد ensureDefault`, /ensureDefault\([^)]*\);[\s\S]{0,180}await enableDefaultAutomation\(/.test(src), "source");
  }

  /* 6) الاختيار العادل: من نشر اليوم يُستثنى، والباقي بترتيب الأقدم خدمةً */
  reset();
  const users = ["u1", "u2", "u3", "u4", "u5"].map((u) => ({ user_id: u, enabled: true, platforms: ["youtube"] }));
  rowsFor = (text) => (/from autopilot/i.test(text) ? users : []);
  restRows = [
    { user_id: "u1", status: "published", created_at: "2026-11-13T04:20:00Z" },
    { user_id: "u2", status: "failed", created_at: "2026-11-13T04:25:00Z" },
    { user_id: "u3", status: "failed", created_at: "2026-11-13T04:28:00Z" },
  ];
  const due = await A.dueConfigs("2026-11-13", 3);
  chk("من نشر اليوم لا يُعاد تشغيله", due.picks.every((c) => c.user_id !== "u1") && due.settled.some((c) => c.user_id === "u1"),
    JSON.stringify({ picks: due.picks.map((c) => c.user_id), settled: due.settled.map((c) => c.user_id) }));
  chk("الاختيار بالأقل خدمةً (ومن لم يُخدم أولًا)",
    due.picks.length === 3 && ["u4", "u5"].includes(due.picks[0].user_id) && ["u4", "u5"].includes(due.picks[1].user_id) && due.picks[0].user_id !== due.picks[1].user_id,
    JSON.stringify(due.picks.map((c) => c.user_id)));
  reset();
  rowsFor = (text) => (/from autopilot/i.test(text) ? users : []);
  const firstDay = await A.dueConfigs("2026-11-13", 3);
  const nextDay = await A.dueConfigs("2026-11-14", 3);
  chk("نقطة البداية تدور بين الأيام لمنع ثبات أول ثلاثة", firstDay.picks.map((c) => c.user_id).join() !== nextDay.picks.map((c) => c.user_id).join());
  chk("قراءة حالة اليوم من استعلام واحد (لا استعلام لكل مستخدم)",
    restCalls.filter((c) => /autopilot_runs/.test(c.p) && /run_date=eq\./.test(c.p)).length === 2,
    JSON.stringify(restCalls.map((c) => c.p.slice(0, 60))));

  /* 7) التشغيل اليومي والإنقاذ يستخدمان الاختيار العادل لا limit 3 الثابتة */
  const src = fs.readFileSync(path.join(ROOT, "lib", "autopilot.js"), "utf8");
  chk("لا `order by updated_at asc limit 3` ثابتة بعد اليوم",
    !/from autopilot where enabled='true' order by updated_at asc limit 3/.test(src), "autopilot.js");
  chk("التشغيل اليومي والإنقاذ والتعويض تستخدم dueConfigs",
    /const \{ picks: list, settled \} = await dueConfigs\(cairoDate\(\), limit\)/.test(src) &&
    /const \{ picks: list, settled, pending \} = await dueConfigs\(runDay, limit\)/.test(src) &&
    /const \{ all \} = await dueConfigs\(cairoDate\(\), 1\)/.test(src), "autopilot.js");

  /* 8) اختيار القارئ صار قابلًا للحفظ */
  const valid = A.RECITERS[0].id;
  const fixed = A.parseTemplate({ reciter_mode: "fixed", reciter: valid });
  chk("قارئ محدّد يُحفظ في القالب", fixed.reciter_mode === "fixed" && fixed.reciter === valid, JSON.stringify(fixed));
  const bad = A.parseTemplate({ reciter_mode: "fixed", reciter: "not-a-reciter" });
  chk("قارئ غير معروف ⇒ رجوع للتدوير", bad.reciter_mode === "rotate" && bad.reciter === "", JSON.stringify(bad));
  reset();
  rowsFor = (text) => (/from autopilot/i.test(text) ? [{ id: "c1", enabled: false, platforms: ["youtube"] }] : []);
  rpcOutcome = "extended";
  const addedWhilePaused = await A.enableDefaultAutomation("u1", "tiktok");
  chk("إضافة منصة لا تلغي إيقاف الأتمتة", addedWhilePaused === "extended" && !sql.some((s) => /enabled\s*=/.test(s.text)));
  chk("القالب الافتراضي ما زال التدوير", A.parseTemplate({}).reciter_mode === "rotate");

  const apiSrc = fs.readFileSync(path.join(ROOT, "api", "autopilot.js"), "utf8");
  chk("مسار الحفظ يقبل reciter_mode/reciter مع التحقق",
    /wantFixed = templateInput\.reciter_mode === "fixed" && RECITERS\.some/.test(apiSrc) && /reciter: wantFixed \? reciterId : ""/.test(apiSrc), "api/autopilot.js");

  /* 9) اللوحة الجديدة تعرض كل ما يحتاجه المستخدم ليفهم ويعمل بنفسه */
  const ui = fs.readFileSync(path.join(ROOT, "public", "js", "publish.js"), "utf8");
  const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
  const need = ["acctStateLabel", "acctEnabled", "acctSteps", "acctKpis", "acctNextRun", "selContentMode", "acctReciter", "selBackground"];
  const miss = need.filter((id) => !html.includes(`id="${id}"`) && !ui.includes(`id="${id}"`) && !ui.includes(`"${id}"`));
  chk("كل عناصر التصميم الجديد موجودة في الماركب أو الرسم", miss.length === 0, miss.join(", "));
  chk("مفتاح التشغيل يستدعي الحفظ فورًا (بلا زر منفصل)", /t\.id !== "acctEnabled"[\s\S]{0,600}this\.api\("set_enabled"/.test(ui), "publish.js");
  chk("مستمع واحد مفوَّض (لا تكرار مستمعات بعد كل رسم)", /if \(this\._wired\) return;/.test(ui) && /root\.addEventListener\("click"/.test(ui));

  /* 10) الشارة الجديدة للنسخ */
  chk("نسخة الواجهة مرفوعة في الماركب والكاش",
    /publish\.js\?v=38/.test(html) && /qr-v59/.test(fs.readFileSync(path.join(ROOT, "public", "sw.js"), "utf8")), "sw/index");

  console.log(errs.length ? `ERRORS ${errs.length}` : `ALL OK (${pass} checks)`);
  if (errs.length) console.log(errs.map((e) => " - " + e).join("\n"));
  process.exit(errs.length ? 1 : 0);
})().catch((e) => { console.log("FAIL استثناء غير متوقع: " + (e && e.stack ? e.stack.split("\n").slice(0, 2).join(" | ") : e)); process.exit(1); });

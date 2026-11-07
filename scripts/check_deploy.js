#!/usr/bin/env node
/* ============================================================
   فحص «هل الإنتاج يخدم آخر كوميت؟» — npm run verify:deploy
   ------------------------------------------------------------
   المشكلة التي يحلها: إذا رُفض رفع النشرة (مثل تجاوز حد دوال Vercel)
   فالبناء ينجح ويظل الموقع يخدم نسخة قديمة بصمت — لا تنبيه ولا خطأ ظاهر.
   هذا السكربت يقارن /api/gw?op=version على الموقع الحقيقي مع آخر كوميت
   على الفرع (main افتراضيًا) ويخرج بـ1 عند التباعد.

   الاستخدام:
     npm run verify:deploy
     BASE=https://quran-reels-tau.vercel.app REF=main node scripts/check_deploy.js
     EXPECT_SHA=<sha> node scripts/check_deploy.js      # بدل ls-remote
   ============================================================ */
const { execFileSync } = require("child_process");
const path = require("path");

const BASE = (process.env.BASE || "https://quran-reels-tau.vercel.app").replace(/\/+$/, "");
const REF = process.env.REF || "main";
const EXPECT = (process.env.EXPECT_SHA || "").trim().toLowerCase();
const REMOTE = process.env.GIT_REMOTE || "origin";
const MAX_LAG = Number(process.env.MAX_COMMITS_BEHIND || 0); // 0 = يجب المطابقة التامة

function git(args) {
  return execFileSync("git", args, { cwd: path.join(__dirname, ".."), encoding: "utf8" }).trim();
}

function remoteSha() {
  if (EXPECT) return EXPECT;
  try {
    const out = git(["ls-remote", REMOTE, REF]);
    const line = out.split("\n").find(Boolean) || "";
    return (line.split(/\s+/)[0] || "").toLowerCase();
  } catch (e) {
    return "";
  }
}

function commitsBehind(deployedSha) {
  try {
    return Number(git(["rev-list", "--count", `${deployedSha}..${REMOTE}/${REF}`]));
  } catch {
    return null;
  }
}

(async () => {
  console.log(`◉ فحص النشرة: ${BASE}  ←  ${REMOTE}/${REF}`);
  const expected = remoteSha();
  if (!expected) {
    console.error("✗ تعذّر تحديد كوميت الفرع (جرّب EXPECT_SHA=<sha> أو تأكد من git remote)");
    process.exit(2);
  }

  let live = null;
  try {
    const r = await fetch(`${BASE}/api/gw?op=version`, { headers: { "cache-control": "no-cache" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    live = await r.json();
  } catch (e) {
    console.error(`✗ تعذّر قراءة /api/gw?op=version من الموقع: ${e.message}`);
    console.error("  (إن كان الموقع على نسخة قديمة جدًا فالمسار غير موجود أصلًا — هذه إشارة على تأخّر النشر)");
    process.exit(2);
  }

  const deployed = String(live.sha || "").toLowerCase();
  console.log(`  الموقع يخدم : ${deployed ? deployed.slice(0, 7) : "(غير معروف)"}  · env=${live.env || "?"} · ref=${live.ref || "?"}`);
  console.log(`  آخر ${REF}     : ${expected.slice(0, 7)}`);

  if (!deployed) {
    console.warn("⚠ الموقع لا يكشف الكوميت (نشرة أقدم من إضافة op=version) — نشرة جديدة مطلوبة");
    process.exit(1);
  }

  if (deployed === expected) {
    console.log("✓ الإنتاج يخدم آخر كوميت — لا تباعد");
    process.exit(0);
  }

  const behind = commitsBehind(deployed);
  const lag = behind === null ? "غير معروف" : String(behind);
  if (behind !== null && behind <= MAX_LAG && MAX_LAG > 0) {
    console.log(`✓ التباعد ${lag} كوميت ≤ المسموح (${MAX_LAG})`);
    process.exit(0);
  }

  console.error(`✗ الإنتاج متأخر عن ${REF} بـ${lag} كوميت — آخر محاولة نشر فشلت على الأرجح.`);
  console.error("  افحص لوحة Vercel (Deployments) أو إيميلات notifications@vercel.com، وشغّل:");
  console.error("  node tests/functions_limit.js");
  process.exit(1);
})();

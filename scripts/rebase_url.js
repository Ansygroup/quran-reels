#!/usr/bin/env node
/* ============================================================
   تبديل نطاق الموقع الأساسي (كمل#14) — انظر docs/domain-setup.md
   الاستخدام:  node scripts/rebase_url.js quran-reels.ansygroup.com
   يبدّل «quran-reels-tau.vercel.app» بكل الملفات النصية للمستودع
   (قوالب، محرّكات بناء، اختبارات، sitemap، llms، README، الوثائق)
   ثم يعيد بناء صفحات الأدوات/المدونة المولَّدة.
   لا يلمس: node_modules · .vcfg · .vercel · .git · ملفات السجلات.
   ============================================================ */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OLD = "quran-reels-tau.vercel.app";
const NEW = (process.argv[2] || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
if (!NEW || !NEW.includes(".")) {
  console.error("الاستخدام: node scripts/rebase_url.js <domain.tld>");
  process.exit(1);
}
if (NEW === OLD) { console.log("النطاق مطابق — لا شيء يحتاج تبديلًا."); process.exit(0); }

const ROOT = path.join(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", ".git", ".vercel", ".vcfg", ".cache", ".venv", "dist", "build", ".next"]);
const EXTS = new Set([".js", ".json", ".html", ".htm", ".md", ".txt", ".xml", ".css", ".sql", ".yml", ".yaml", ".py", ".sh"]);

let files = 0, hits = 0;
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    if (!EXTS.has(path.extname(name))) continue;
    let s;
    try { s = fs.readFileSync(p, "utf8"); } catch { continue; }
    if (!s.includes(OLD)) continue;
    const n = s.split(OLD).length - 1;
    fs.writeFileSync(p, s.split(OLD).join(NEW));
    files++; hits += n;
    console.log(`  ${path.relative(ROOT, p)}  (${n})`);
  }
}
walk(ROOT);
console.log(`\nاستُبدل ${hits} موضعًا في ${files} ملفًا: ${OLD} → ${NEW}`);

if (files) {
  console.log("\nإعادة بناء الصفحات المولَّدة…");
  for (const b of ["build_lp.js", "build_k12.js", "build_blog.js"]) {
    execSync(`node scripts/${b}`, { cwd: ROOT, stdio: "inherit" });
  }
}
console.log(`\n✓ تم. الخطوات التالية:
  1) npm test                 (أخضر محليًا)
  2) vercel deploy --prod
  3) GSC: أضف الدومين الجديد + أرسل sitemap
  4) IndexNow مرة واحدة للدومين الجديد`);

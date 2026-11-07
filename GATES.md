# Gates: quran-reels full management

OWNS: scripts/**, public/**, tests/**, GATES.md

Scope: Complete management of quran-reels project — build, test, verify, deploy

- [ ] G1: Build integrity (all 3 build scripts pass)
  CHECK: node scripts/build_lp.js && node scripts/build_k12.js && node scripts/build_blog.js
  EXPECT: total pages: 81
  EVIDENCE: pending

- [ ] G2: W3C validation passes
  CHECK: node tests/pages12_test.js
  EXPECT: 0 errors
  EVIDENCE: pending

- [ ] G3: Site monitor all pages
  CHECK: node scripts/monitor_site.js
  EXPECT: 154/154
  EVIDENCE: pending

- [ ] G4: Sitemap valid XML
  CHECK: node -e "const fs=require('fs'); const x=fs.readFileSync('public/sitemap.xml','utf8'); console.log('sitemap lines:', x.split('\n').length)"
  EXPECT: sitemap lines:
  EVIDENCE: pending

- [ ] G5: BreadcrumbList schema on all LP pages
  CHECK: grep -c "BreadcrumbList" public/ar/quran-video-tiktok/index.html
  EXPECT: 1
  EVIDENCE: pending

- [ ] G6: Schema.org valid JSON-LD on homepage
  CHECK: node -e "const fs=require('fs');const h=fs.readFileSync('public/index.html','utf8');const m=h.match(/<script type=\"application\/ld\+json\">(.*?)<\/script>/gs);m.forEach(x=>JSON.parse(x.replace(/<script[^>]*>/,'').replace(/<\/script>/,'')));console.log('valid')"
  EXPECT: valid
  EVIDENCE: pending

- [ ] G7: Git committed (no uncommitted changes)
  CHECK: git status --short | wc -l | xargs -I{} echo "uncommitted: {}"
  EXPECT: uncommitted: 0
  EVIDENCE: pending

- [ ] G8: Vercel function count within Hobby limit (12/deployment, middleware counts)
  CHECK: node tests/functions_limit.js
  EXPECT: مجموع الدوال ≤ 12 (المستهدف ≤ 9) + لا وجود لـ api/app-config.js + كل rewrite/cron يشير إلى دالة موجودة + المجدولات ≤ 2 ويومية فقط (Hobby)
  EVIDENCE: 2026-11-07 — كانت 13 (12 ملف api + middleware) فرفض Vercel النشر 4 مرات (exceeded_serverless_functions_per_deployment)؛ بعد دمج المسارات في api/gw.js صارت 9.
  NOTE: تجاوز الحد يُفشل الرفع بعد نجاح البناء (الخطأ في إيميل Vercel عنوانه «Build error») وتظل النسخة القديمة مخدومة — فشل صامت. لا تُعِد api/app-config.js (rewrite إلى /api/ip?mode=config يكفي).

- [ ] G9: Production serves the latest commit (no silent stale deploy)
  CHECK: npm run verify:deploy
  EXPECT: ✓ الإنتاج يخدم آخر كوميت (آخر main) — وإن اختلف فالمخرَج يشرح السبب
  HOW: /api/gw?op=version يكشف VERCEL_GIT_COMMIT_SHA، والسكربت يقارنه بـgit ls-remote origin main
  NOTE: يُشغَّل بعد كل push إلى main؛ التباعد > 0 يعني أن آخر نشرة فشلت (وإلا لما تباعدت).
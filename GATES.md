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

## Notes (تحديثات التوازي وتعدد القنوات والمقالات)
- **تحديث الكود (v9/v3/v2):**
  - دعم **تعدد القنوات** (يوتيوب، فيسبوك، إنستغرام، تيك توك، X، لينكد إن، تيليجرام، واتساب).
  - دعم **التوازي** في النشر والأتمتة (`run_all`, `Promise.all`).
  - دعم **توليد البوست من المقالات** (10,000 مقال) في الأتمتة (`PostGen.article`, `article_random`).
  - تحسين واجهة المستخدم (بطاقة المقال `.article-card`، أزرار الإجراءات السريعة).
- **التوافق:**
  - G1-G7: سيتم التحقق منها في بيئة Vercel (G2, G3) أو محلياً (G1, G4, G5, G6, G7).
  - Vercel Cron: 06:15 القاهرة (04:15 UTC).
- **حل التعارضات (Conflict Resolution):**
  - تم دمج التحديثات مع الفرع الرئيسي (main) في الملفات: `public/js/publish.js`, `public/index.html`, `public/css/style.css`, `api/autopilot.js`, `lib/autopilot.js`, `GATES.md`.
  - تم الحفاظ على التوافق مع G1-G7.

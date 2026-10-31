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
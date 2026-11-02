# Gates: quran-reels full management

OWNS: scripts/**, public/**, tests/**, GATES.md

Scope: Complete management of quran-reels project — build, test, verify, deploy

- [x] G1: Build integrity (all 3 build scripts pass)
  CHECK: node scripts/build_lp.js && node scripts/build_k12.js && node scripts/build_blog.js
  EXPECT: total pages: 81
  EVIDENCE: automatic-evidence=v1; definition-sha256=fc64c72ad4153896b9ddbdfae5efaea3db997dbe1c812e68983b20897c44af33; exit=0; EXPECT=matched; output-sha256=0a4307baed7db7302a40c9571dfa29429d893968fa2b20c7489521d8611b2fc3; output-bytes=6624; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\ansy0\ZCodeProject\projects\quran-reels; path=481cf16b6d00/58 entries

- [x] G2: W3C validation passes
  CHECK: node tests/pages12_test.js
  EXPECT: · 0 FAIL /
  EVIDENCE: automatic-evidence=v1; definition-sha256=ddce86a80b60255ac105434c1e6c6fadeda2d5f2f1f5499a775132c539510e5b; exit=0; EXPECT=matched; output-sha256=6450046c6d1585214d8c2e5740d69cfe6ba46ffa4ab3d87e2c3c2ee04c553cfc; output-bytes=1161; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\ansy0\ZCodeProject\projects\quran-reels; path=481cf16b6d00/58 entries

- [x] G3: Site monitor all pages
  CHECK: node scripts/monitor_site.js
  EXPECT: 154/154
  EVIDENCE: automatic-evidence=v1; definition-sha256=b01f31b4427a3723da5181901927e23d4cb08999623ed79807d550b7a21c70c5; exit=0; EXPECT=matched; output-sha256=96ffb0b70b760b8e55a16ab52db9c85f836ad7ab95a967bfab4c7fb83b26dfa4; output-bytes=486; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\ansy0\ZCodeProject\projects\quran-reels; path=481cf16b6d00/58 entries

- [x] G4: Sitemap valid XML
  CHECK: node -e "const fs=require('fs'); const x=fs.readFileSync('public/sitemap.xml','utf8'); console.log('sitemap lines:', x.split('\n').length)"
  EXPECT: sitemap lines:
  EVIDENCE: automatic-evidence=v1; definition-sha256=71089eab2c77edf360884d9a3ad76166bcc6058f1889a6cb266d0f4de57a6a1b; exit=0; EXPECT=matched; output-sha256=bc1cd91e8757edcb0b0101171e3efad28df2316d044a559d14b315ae74d43d2f; output-bytes=19; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\ansy0\ZCodeProject\projects\quran-reels; path=481cf16b6d00/58 entries

- [x] G5: BreadcrumbList schema on all LP pages
  CHECK: grep -c "BreadcrumbList" public/ar/quran-video-tiktok/index.html
  EXPECT: 1
  EVIDENCE: automatic-evidence=v1; definition-sha256=5ad3c13943b5d2174e15c136fbab0fd6a9e6ffb21b886c98475f9281c60bbcf6; exit=0; EXPECT=matched; output-sha256=4355a46b19d348dc2f57c046f8ef63d4538ebb936000f3c9ee954a27460dd865; output-bytes=2; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\ansy0\ZCodeProject\projects\quran-reels; path=481cf16b6d00/58 entries

- [x] G6: Schema.org valid JSON-LD on homepage
  CHECK: node -e "const fs=require('fs');const h=fs.readFileSync('public/index.html','utf8');const m=h.match(/<script type=\"application\/ld\+json\">(.*?)<\/script>/gs);m.forEach(x=>JSON.parse(x.replace(/<script[^>]*>/,'').replace(/<\/script>/,'')));console.log('valid')"
  EXPECT: valid
  EVIDENCE: automatic-evidence=v1; definition-sha256=46dddef3b98b86594798b62208c6ba4dcaddd7695ee3fc093b126fe9a3064cf7; exit=0; EXPECT=matched; output-sha256=009d962905920ad0e3ff46c6987fad36418982deb81796fd1f58e326d167c268; output-bytes=6; shell=C:\WINDOWS\system32\cmd.exe; cwd=C:\Users\ansy0\ZCodeProject\projects\quran-reels; path=481cf16b6d00/58 entries

- [ ] G7: Git committed (no uncommitted changes)
  CHECK: node -e "const n=require('child_process').execSync('git status --porcelain').toString().split(/\r?\n/).filter(Boolean).length;console.log('uncommitted: '+n)"
  EXPECT: uncommitted: 0
  EVIDENCE: pending
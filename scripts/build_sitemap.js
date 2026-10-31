#!/usr/bin/env node
/* ============================================================
 * build_sitemap.js — كمل#24 (+ كمل#24ه: وسوم صور image:)
 * يقرأ public/sitemap.xml الحالي (يشمل 500 مقالة قديمة) ويُعيد بناءه:
 *   (القديم − روابط المقالات القديمة) + 20,000 مقالة + 136 بوابة + صفحات الأرشيف المادية
 * الناتج الحالي المتوقع: 20,000 مقال + 136 محورًا + 143 أرشيفًا + الصفحات الحية الأخرى. الاستدعاء: node scripts/build_sitemap.js
 * كمل#24ه: أي مقالة لها public/img/articles/<slug>.jpg تأخذ <image:image>
 *   (loc + title) بحسب مخطط Google Image Sitemap — تُعاد بعد كل دفعة صور.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ORIGIN = "https://quran-reels-tau.vercel.app";
const PUB = "2026-10-30";
const CLUSTERS = ["video", "reciters", "prayer", "hifz", "azkar", "seasons", "family", "publishing"];

const root = path.join(__dirname, "..");
const smPath = path.join(root, "public", "sitemap.xml");
const xml = fs.readFileSync(smPath, "utf8");
const oldLocs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (oldLocs.length < 700) throw new Error("old sitemap too small: " + oldLocs.length);

const OLD = require(path.join(root, "posts", "index.js"));
const oldSlugs = new Set(OLD.map((s) => s.slug));
const isOldArticle = (loc) => {
  // تُحذف كل مقالات المكتبة القديمة؛ يعاد بناؤها من مصادرها الحالية أدناه.
  const m = loc.match(/\/articles\/([^/]+)\/$/);
  return !!m && !loc.includes("/en/");
};
const hasLocalPage = (loc) => {
  try {
    const pathname = decodeURIComponent(new URL(loc).pathname).replace(/^\/+/, "");
    const base = path.join(root, "public", pathname);
    return fs.existsSync(base) && fs.statSync(base).isFile()
      || fs.existsSync(path.join(base, "index.html"));
  } catch (e) { return false; }
};

const entries = []; // {loc, lastmod?, title?}
const seen = new Set();
const push = (loc, lastmod, title) => {
  if (seen.has(loc)) return;
  seen.add(loc);
  entries.push(title ? { loc, lastmod, title } : { loc, lastmod });
};
const escXml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// 1) ما عدا المقالات القديمة من الخريطة الحالية (يبقى lastmod الأصلي إن وُجد)
const oldLastmod = new Map();
for (const block of xml.split("<url>").slice(1)) {
  const l = block.match(/<loc>([^<]+)<\/loc>/);
  const d = block.match(/<lastmod>([^<]+)<\/lastmod>/);
  if (l) oldLastmod.set(l[1], d ? d[1] : null);
}
let kept = 0, droppedMissing = 0;
for (const loc of oldLocs) {
  if (isOldArticle(loc)) continue;
  if (!hasLocalPage(loc)) { droppedMissing++; continue; }
  push(loc, oldLastmod.get(loc) || undefined);
  kept++;
}

// 2) 20,000 مقالة (500 أصلية + 19,500 مولّدة) بآخر تحديث اليوم
const allSlugs = [];
for (const s of OLD) allSlugs.push(s.slug);
for (const c of CLUSTERS) {
  const arr = JSON.parse(fs.readFileSync(path.join(root, "posts", "out", c + ".json"), "utf8"));
  for (const s of arr) allSlugs.push(s.slug);
}
if (new Set(allSlugs).size !== 20000) throw new Error("slugs != 20000: " + new Set(allSlugs).size);
// كمل#24ه: عنوان كل مقالة + صورها إن وُجدت
const IMGDIR = path.join(root, "public", "img", "articles");
let imgN = 0;
for (const s of OLD) {
  const has = fs.existsSync(path.join(IMGDIR, s.slug + ".jpg"));
  if (has) imgN++;
  push(`${ORIGIN}/articles/${s.slug}/`, PUB, has ? s.title : undefined);
}
for (const c of CLUSTERS) {
  const arr = JSON.parse(fs.readFileSync(path.join(root, "posts", "out", c + ".json"), "utf8"));
  for (const s of arr) {
    const has = fs.existsSync(path.join(IMGDIR, s.slug + ".jpg"));
    if (has) imgN++;
    push(`${ORIGIN}/articles/${s.slug}/`, PUB, has ? s.title : undefined);
  }
}

// 3) 136 بوابة محور
const GEN = {};
const gslugs = [];
for (const c of CLUSTERS) {
  GEN[c] = require(path.join(root, "posts", "gen_data_" + c + ".js"));
  for (const g of GEN[c].groups) gslugs.push(g.slug);
}
if (gslugs.length !== 136 || new Set(gslugs).size !== 136) throw new Error("group slugs != 136");
for (const g of gslugs) push(`${ORIGIN}/articles/${g}/`, PUB);

// 4) صفحات المقالات المادية خارج مجموعة الـ20,000 والبوابات: أرشيف ثابت بلا تكرار
const currentSlugs = new Set([...allSlugs, ...gslugs]);
const articlesDir = path.join(root, "public", "articles");
const legacySlugs = fs.readdirSync(articlesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^[a-z0-9-]+$/.test(d.name) && !currentSlugs.has(d.name)
    && fs.existsSync(path.join(articlesDir, d.name, "index.html")))
  .map((d) => d.name)
  .sort();
for (const slug of legacySlugs) push(`${ORIGIN}/articles/${slug}/`, undefined);

const out = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.map((e) => `  <url><loc>${e.loc}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}${e.title ? `<image:image><image:loc>${ORIGIN}/img/articles/${e.loc.match(/\/articles\/([^/]+)\/$/)[1]}.jpg</image:loc><image:title>${escXml(e.title)}</image:title></image:image>` : ""}</url>`).join("\n")}
</urlset>
`;
const expectedTotal = kept + allSlugs.length + gslugs.length + legacySlugs.length;
if (entries.length !== expectedTotal) throw new Error(`TOTAL != ${expectedTotal}: ` + entries.length);
fs.writeFileSync(smPath, out);
console.log(`sitemap: kept=${kept} (missing dropped=${droppedMissing}) + articles=${allSlugs.length} + hubs=${gslugs.length} + archive=${legacySlugs.length} → TOTAL=${entries.length} · image:blocks=${imgN}`);
console.log(`OK → public/sitemap.xml (${entries.length})`);

#!/usr/bin/env node
/* ============================================================
 * باني خريطة الموقع — يجعل sitemap.xml مطابقًا للملفات الموجودة فعلًا.
 * ------------------------------------------------------------
 * المشكلة التي وُلد بسببها: كانت الخريطة تعلن 20,536 رابطًا منها 12,286
 * (61%) بلا صفحة على القرص — قسم /articles وحده يعلن 20,280 رابطًا والموجود
 * 7,994. النتيجة: زحف محركات البحث إلى آلاف صفحات 404 ناعمة، وإشارة جودة
 * سلبية للنطاق كله.
 *
 * القاعدة: الخريطة تُبنى من القرص لا من قائمة أمنيات.
 *   • تُضمّن كل صفحة HTML قابلة للفهرسة تحت public/ (index.html → /)
 *   • تُستثنى 404 والصفحات التي فيها robots=noindex وملفات تحقق جوجل
 *   • تُبقى <lastmod> القديمة للروابط القائمة (لا نغيّر تواريخها زورًا)
 *     والجديدة تأخذ تاريخ آخر تعديل للملف
 *
 * التشغيل: node scripts/build_sitemap.js [--check]
 *   --check: يتحقّق فقط ويخرج بـ1 عند أي انحراف (يُستخدم في الاختبارات)
 * ============================================================ */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const SITE = "https://quran-reels-tau.vercel.app";
const MAP = path.join(PUBLIC, "sitemap.xml");
const CHECK = process.argv.includes("--check");

const EXCLUDE_NAMES = new Set(["404.html"]);
const isVerification = (f) => /^google[0-9a-z]+\.html$/i.test(f);

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (["node_modules", ".vercel", "img", "fonts", "data", "css", "js"].includes(e.name)) continue;
      walk(p, acc);
    } else if (e.name.endsWith(".html")) acc.push(p);
  }
  return acc;
}

/* رابط الصفحة من مسار الملف */
function urlPathOf(file) {
  let rel = path.relative(PUBLIC, file).split(path.sep).join("/");
  if (rel === "index.html") return "/";
  if (rel.endsWith("/index.html")) return "/" + rel.slice(0, -"index.html".length);
  return "/" + rel;
}

/* استبعاد صفحات لا تُفهرس */
function indexable(file) {
  const name = path.basename(file);
  if (EXCLUDE_NAMES.has(name) || isVerification(name)) return false;
  const head = fs.readFileSync(file, "utf8").slice(0, 4000);
  if (/name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(head)) return false;
  return true;
}

function lastmodOf(file) {
  const d = fs.statSync(file).mtime;
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/* lastmod الموجودة حاليًا (نحترمها) */
const existing = new Map();
if (fs.existsSync(MAP)) {
  const xml = fs.readFileSync(MAP, "utf8");
  for (const m of xml.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?<\/url>/g)) {
    const p = m[1].replace(/^https?:\/\/[^/]+/, "");
    existing.set(decodeURIComponent(p), m[2] || "");
  }
}

const pages = walk(PUBLIC).filter(indexable);
const entries = [];
for (const file of pages) {
  const p = urlPathOf(file);
  if (/\s/.test(p)) continue;
  const lastmod = existing.get(decodeURIComponent(p)) || lastmodOf(file);
  entries.push({ path: p, lastmod });
}

/* العدد الأكبر من الروابط الموجودة في الخريطة القديمة = كلها ميتة، تُهمل */
entries.sort((a, b) => (a.path === "/" ? -1 : b.path === "/" ? 1 : a.path.localeCompare(b.path)));

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
  ...entries.map((e) => `  <url><loc>${SITE}${e.path}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}</url>`),
  "</urlset>",
  "",
].join("\n");

const current = fs.existsSync(MAP) ? fs.readFileSync(MAP, "utf8") : "";
const removed = [...existing.keys()].filter((p) => !entries.some((e) => decodeURIComponent(e.path) === p)).length;

if (CHECK) {
  const okNow = current === xml;
  console.log(`sitemap: ${[...existing.keys()].length} رابطًا حاليًا · ${entries.length} صفحة على القرص · ${removed} رابطًا ميتًا`);
  if (!okNow) {
    console.log("FAIL خريطة الموقع لا تطابق الملفات — شغّل: node scripts/build_sitemap.js");
    process.exit(1);
  }
  console.log("OK   خريطة الموقع مطابقة لما على القرص");
  process.exit(0);
}

fs.writeFileSync(MAP, xml, "utf8");
console.log(`✓ كُتب sitemap.xml: ${entries.length} رابطًا (حُذف ${removed} رابطًا بلا صفحة)`);

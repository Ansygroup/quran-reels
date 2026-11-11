#!/usr/bin/env node
/* ============================================================
 * حاجز خريطة الموقع والأرقام المعلنة
 * ------------------------------------------------------------
 * العطل: كانت sitemap.xml تعلن 20,536 رابطًا منها 12,286 (61%) بلا صفحة
 * على القرص (قسم /articles يعلن 20,280 والموجود 7,994)، وكانت الصفحة
 * الرئيسية وllms.txt تَعِدان بـ«20,000 مقال». زحف محركات البحث إلى آلاف
 * صفحات 404 ناعمة، ووعدٌ لا يطابق المخزون.
 *
 * يقيس هذا الملف الواقع من القرص ويقارنه بالخريطة والنصوص المعلنة.
 *
 * التشغيل: node tests/sitemap_test.js   (ويُشغَّل تلقائيًا قبل npm test)
 * ============================================================ */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");

let pass = 0;
const errs = [];
const ok = (m) => { pass++; console.log("OK   " + m); };
const fail = (m) => { errs.push(m); console.log("FAIL " + m); };
const chk = (n, c, x = "") => (c ? ok(n) : fail(n + (x ? " :: " + x : "")));

/* 1) الخريطة مطابقة للقرص (يبنيها السكربت بنفس القواعد) */
let buildOut = "";
try {
  buildOut = execFileSync(process.execPath, [path.join(ROOT, "scripts", "build_sitemap.js"), "--check"], { encoding: "utf8" });
} catch (e) {
  buildOut = String(e.stdout || e.message);
}
chk("sitemap.xml مطابقة للملفات على القرص", /OK\s+خريطة الموقع/.test(buildOut), buildOut.trim().split("\n")[0]);

/* 2) لا رابط ميت في الخريطة */
const xml = fs.readFileSync(path.join(PUBLIC, "sitemap.xml"), "utf8");
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const toFile = (u) => path.join(PUBLIC, decodeURIComponent(u.replace(/^https?:\/\/[^/]+/, "")).replace(/^\//, ""));
const dead = urls.filter((u) => {
  const f = toFile(u);
  return !(fs.statSync(f, { throwIfNoEntry: false })?.isFile() || fs.statSync(path.join(f, "index.html"), { throwIfNoEntry: false })?.isFile());
});
chk(`لا روابط ميتة في sitemap (${urls.length} رابطًا)`, dead.length === 0, dead.slice(0, 5).join(" · "));

/* 3) كل مقال على القرص مُدرج */
const articleDirs = fs.readdirSync(path.join(PUBLIC, "articles"), { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(PUBLIC, "articles", e.name, "index.html")))
  .map((e) => e.name);
const listed = new Set(urls.map((u) => decodeURIComponent(u.replace(/^https?:\/\/[^/]+/, "")).replace(/^\/|\/$/g, "")));
const unlisted = articleDirs.filter((d) => !listed.has(`articles/${d}`));
chk(`كل المقالات مُدرجة (${articleDirs.length})`, unlisted.length === 0, "غير مُدرج: " + unlisted.slice(0, 5).join(" · "));

/* 4) الأرقام المعلنة تطابق المخزون */
const homepage = fs.readFileSync(path.join(PUBLIC, "index.html"), "utf8");
const claims = [...homepage.matchAll(/([\d,]{4,})\s*(?:دليل|مقال)/g)].map((m) => Number(m[1].replace(/,/g, "")));
const inflated = claims.filter((n) => n > articleDirs.length);
chk("أرقام المقالات في الصفحة الرئيسية لا تتجاوز المخزون", inflated.length === 0, "معلن: " + inflated.join(", ") + ` · موجود: ${articleDirs.length}`);

const llms = fs.readFileSync(path.join(PUBLIC, "llms.txt"), "utf8");
const llmsClaims = [...llms.matchAll(/([\d,]{4,})\s*(?:مقال|دليل)/g)].map((m) => Number(m[1].replace(/,/g, "")));
const llmsInflated = llmsClaims.filter((n) => n > articleDirs.length);
chk("أرقام llms.txt لا تتجاوز المخزون", llmsInflated.length === 0, "معلن: " + llmsInflated.join(", "));

/* 5) لا يظهر رقم قديم متضخم في السكربتات */
const stale = ["public/index.html", "public/llms.txt", "public/llms-full.txt"]
  .filter((f) => /20,000|20,393/.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
chk("لا أرقام متضخمة قديمة (20,000 / 20,393)", stale.length === 0, stale.join(", "));

console.log(errs.length ? `ERRORS ${errs.length}` : `ALL OK (${pass} checks)`);
if (errs.length) console.log(errs.map((e) => " - " + e).join("\n"));
process.exit(errs.length ? 1 : 0);

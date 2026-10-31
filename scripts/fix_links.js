#!/usr/bin/env node
/* كمل#26 — خطوة ما بعد البناء: الروابط الداخلية المكسورة.
 * المولّدات تربط أحيانًا بمواضيع فرعية لم تُنتَج كمقالات، فتعود 404 (أو تُخفى كـ200 بالصفحة الرئيسية).
 * هنا: كل <a href="/..."> يشير إلى ملف غير موجود يتحوّل إلى عنصر غير قابل للنقر بنفس المحتوى
 * (بطاقة rc-card → <div>، غيرها → <span>). idempotent. --dry-run لعرض العدّ فقط. */
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..", "public");
const dry = process.argv.includes("--dry-run");
const exists = (href) => {
  const rel = href.replace(/^\//, "");
  if (rel === "") return true;
  if (fs.existsSync(path.join(root, rel)) && fs.statSync(path.join(root, rel)).isFile()) return true;
  return fs.existsSync(path.join(root, rel, "index.html"));
};
const ANCHOR = /<a\b([^>]*?)\bhref="(\/[^"#?\s]*)"([^>]*)>([\s\S]*?)<\/a>/g;
let files = 0, changed = 0, removed = 0;
const cache = new Map();
const ex = (h) => { if (!cache.has(h)) cache.set(h, exists(h)); return cache.get(h); };
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".html")) {
      files++;
      const s = fs.readFileSync(p, "utf8");
      let n = 0;
      const out = s.replace(ANCHOR, (m, pre, href, post, inner) => {
        if (ex(href)) return m;
        n++;
        const attrs = pre + post;
        const cls = (attrs.match(/class="([^"]*)"/) || [, ""])[1];
        return /\brc-card\b/.test(cls) ? `<div class="rc-card">${inner}</div>` : `<span>${inner}</span>`;
      });
      if (n) { changed++; removed += n; if (!dry) fs.writeFileSync(p, out); }
    }
  }
}
walk(root);
console.log(`fix_links: files=${files} pages-fixed=${changed} links-neutralized=${removed}${dry ? " (dry)" : ""}`);

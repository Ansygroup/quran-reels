#!/usr/bin/env node
/* كمل#25 — يحقن وسم Monetag قبل </head> في كل صفحات HTML العامة (idempotent).
 * السبب: build_*.js يعيد كتابة الصفحات فيمسح الوسم. شغّله بعد كل بناء:
 *   node scripts/build_posts.js && node scripts/inject_monetag.js
 * الاستثناء الوحيد: صفحات بلا </head> أو بوسم مسبق (لا تُكرَّر).
 * يدعم --dry-run لعرض العدّ فقط. */
"use strict";
const fs = require("fs");
const path = require("path");
const TAG = '<script src="https://quge5.com/88/tag.min.js" data-zone="303174" async data-cfasync="false"></script>';
const MARK = "quge5.com/88/tag.min.js";
const dry = process.argv.includes("--dry-run");
const root = path.join(__dirname, "..", "public");
let scanned = 0, added = 0, had = 0, nohead = 0;
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".html")) {
      scanned++;
      const s = fs.readFileSync(p, "utf8");
      if (s.includes(MARK)) { had++; continue; }
      const i = s.indexOf("</head>");
      if (i < 0) { nohead++; continue; }
      if (!dry) fs.writeFileSync(p, s.slice(0, i) + TAG + "\n" + s.slice(i));
      added++;
    }
  }
}
walk(root);
console.log(`monetag: scanned=${scanned} already=${had} added=${added}${dry ? " (dry)" : ""} no-head=${nohead}`);

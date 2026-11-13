/* منع رجوع شبكة الإعلانات المعروفة للصفحات أو مولّداتها أو CSP. */
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const forbidden = /quge5\.com|3nbf4\.com|(?:my\.)?rtmark\.net|094kk\.com|jmosl\.com|auqot\.com|ekhay\.com|b3mny\.com|6opo\.com|googlesyndication|adsbygoogle|monetag|data-zone=["']303174/iu;
function scan(root, accept) {
  let count = 0;
  for (const item of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, item.name);
    if (item.isDirectory()) count += scan(file, accept);
    else if (item.isFile() && accept(file)) {
      assert(!forbidden.test(fs.readFileSync(file, "utf8")), `ad integration found: ${file}`); count++;
    }
  }
  return count;
}
const pages = scan("public", f => /\.(?:html|js)$/i.test(f));
const scripts = scan("scripts", f => /\.js$/i.test(f));
for (const f of ["package.json", "vercel.json"]) assert(!forbidden.test(fs.readFileSync(f, "utf8")), f);
const config = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
const policies = config.headers.flatMap(h => h.headers.filter(x => x.key.toLowerCase() === "content-security-policy"));
assert(policies.length >= 3);
for (const {value} of policies) {
  assert(value.includes("frame-src 'none'"));
  for (const source of ["https://*.supabase.co", "https://everyayah.com", "https://qurango.net"]) assert(value.includes(source));
}
assert(!fs.existsSync("scripts/inject_monetag.js"));
console.log(`Ad scan PASS: ${pages} public HTML/JS files, ${scripts} scripts, ${policies.length} CSP policies`);

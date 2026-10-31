#!/usr/bin/env node
/*
 * Repair dead same-site anchor destinations in legacy/static HTML.
 * Run after page generation. Article destinations are mapped to a published
 * variant (guide/steps/etc.) when the old base slug no longer exists.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ORIGIN = "https://quran-reels-tau.vercel.app";
const PUBLIC = path.join(__dirname, "..", "public");
const BLOG_ALIASES = new Map([
  ["/blog/ramadan-content-ideas/", "/blog/ramadan-content-plan/"],
  ["/articles/friday-content/", "/blog/friday-content/"]
]);
const FORMAT_ORDER = ["guide", "steps", "tips", "examples", "template", "checklist", "compare", "mistakes", "diagnose", "plan", "faq"];
const articleSlugs = new Set(fs.readdirSync(path.join(PUBLIC, "articles"), { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(PUBLIC, "articles", e.name, "index.html")))
  .map((e) => e.name));
const articleList = [...articleSlugs];

function localFile(pathname) {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, "");
  const target = path.join(PUBLIC, rel);
  if (fs.existsSync(target) && fs.statSync(target).isFile()) return target;
  const index = path.join(target, "index.html");
  return fs.existsSync(index) ? index : null;
}
function articleReplacement(pathname) {
  const slug = pathname.replace(/^\/articles\//, "").replace(/\/$/, "");
  const exact = articleSlugs.has(slug) ? slug : null;
  if (exact) return `/articles/${exact}/`;
  const candidates = articleList.filter((s) => s.startsWith(slug + "-"));
  if (candidates.length) {
    candidates.sort((a, b) => {
      const rank = (s) => {
        const suffix = s.slice(slug.length + 1);
        const i = FORMAT_ORDER.findIndex((f) => suffix === f || suffix.startsWith(f + "-"));
        return i < 0 ? FORMAT_ORDER.length : i;
      };
      return rank(a) - rank(b) || a.length - b.length || a.localeCompare(b);
    });
    return `/articles/${candidates[0]}/`;
  }
  return "/articles/";
}
function replacementFor(href) {
  let u;
  try { u = new URL(href, ORIGIN); } catch { return null; }
  if (u.origin !== ORIGIN) return null;
  let p = u.pathname;
  if (localFile(p)) return null;
  if (BLOG_ALIASES.has(p)) return BLOG_ALIASES.get(p) + u.search + u.hash;
  if (p === "/tools/") return "/en/tools/" + u.search + u.hash;
  if (p.startsWith("/articles/") && p.endsWith("/")) return articleReplacement(p) + u.search + u.hash;
  return "/" + u.search + u.hash;
}

let scanned = 0, changed = 0;
const examples = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.name.endsWith(".html")) {
      scanned++;
      const original = fs.readFileSync(file, "utf8");
      const updated = original.replace(/<a\b[^>]*\bhref=(['"])([^'"]+)\1/gi, (tag, quote, href) => {
        const next = replacementFor(href);
        if (!next || next === href) return tag;
        changed++;
        if (examples.length < 20) examples.push(`${href} -> ${next} (${path.relative(PUBLIC, file)})`);
        return tag.replace(`${quote}${href}${quote}`, `${quote}${next}${quote}`);
      });
      if (updated !== original) fs.writeFileSync(file, updated);
    }
  }
}
walk(PUBLIC);
console.log(`internal-links: scanned=${scanned} repaired=${changed}`);
for (const line of examples) console.log("  " + line);

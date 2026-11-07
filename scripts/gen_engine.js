#!/usr/bin/env node
/* ============================================================ كمل#24 — محرك توليد 19,500 مقالة
 * tiered: 2,000 عميقة (250/cluster) + 17,500 منهجية = 19,500 جديدة (+500 أصلية = 20,000)
 * يقرأ posts/gen_data_*.js الثمانية، يوسّع (subject × fmt × صفات مؤهّلة)، يفرض بوابات التشابه،
 * ويرمّز إلى posts/out/<cluster>.json + posts/out/manifest.json
 * الاستدعاء: node scripts/gen_engine.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

const CLUSTERS = ["video", "reciters", "prayer", "hifz", "azkar", "seasons", "family", "publishing"];
const TARGETS = { video: 2440, reciters: 2440, prayer: 2440, hifz: 2440, azkar: 2440, publishing: 2440, seasons: 2430, family: 2430 };
const DEEP_PER = 250; // ك25: يحافظ على نسبة10% عميقة مع ضِعاف الحجم
const PUB = "2026-10-30";
const SUFFIX = " | قرآن ريلز";
const TITLE_MAX = 100;
const DESC_MAX = 160;
const TOOLS = [
  ["/ar/quran-video-maker/", "الصانع المجاني"],
  ["/ar/quran-reels-ai/", "مولّد قرآن ريلز بالذكاء الاصطناعي"],
  ["/", "قرآن ريلز"],
  ["/articles/", "مكتبة المقالات كاملة"]
];
const PT = { guide: "guide", diagnose: "guide", compare: "guide", faq: "guide", mistakes: "mistakes",
  tips: "tips", examples: "tips", template: "tips", tools: "tips", startpath: "tips",
  checklist: "checklist", plan: "checklist", steps: "checklist" };
const FMT_PREF = ["guide", "steps", "diagnose", "plan", "template", "compare", "tips", "examples",
  "mistakes", "checklist", "tools", "startpath", "faq"];

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h;
}
function pick(arr, n) { return arr[((n % arr.length) + arr.length) % arr.length]; }
function trimDesc(d) {
  if (d.length <= DESC_MAX) return d;
  const cut = d.slice(0, DESC_MAX - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > 60 ? cut.slice(0, sp) : cut).replace(/[،,:؛-]+$/, "") + "…";
}
const QUAL_ALLOW = {
  publishing: { ctx: ["in-ramadan","busy-workday","first-month","while-traveling","exam-season","before-fajr","on-a-budget","winter-nights"], auds: ["for-beginners","advanced","for-teachers"] }
};
function qualPool(d, cname) {
  const allow = QUAL_ALLOW[cname];
  const ctxs = allow ? (d.ctx || []).filter((c) => allow.ctx.includes(c.slug)) : (d.ctx || []);
  const auds = allow ? (d.auds || []).filter((a) => allow.auds.includes(a.slug)) : (d.auds || []);
  const pool = [{ none: true }];
  for (const c of ctxs) pool.push({ s: c.s, kw: c.kw, slug: c.slug, type: "ctx" });
  for (const a of auds) pool.push({ s: a.s, kw: a.kw, slug: a.slug, type: "aud" });
  for (const c of ctxs) for (const a of auds)
    pool.push({ s: `${a.s} ${c.s}`, kw: `${a.kw}, ${c.kw}`, slug: `${a.slug}-${c.slug}`, type: "both" });
  return pool;
}
function normWords(str) {
  return (str.match(/[\u0621-\u064A]{3,}/g) || []).map((w) => w.replace(/^ال/, "")).filter((w) => w.length >= 3);
}
function openerFits(op, s) {
  const st = new Set(normWords(s.s + " " + s.kw));
  return normWords(op).some((w) => st.has(w));
}
function qualTail(q) {
  if (!q || q.none) return "";
  return `${q.s}: أوراد هذا الموضوع مضبوطة على هذا السياق بالذات.`;
}

const outDir = path.join(__dirname, "..", "posts", "out");
fs.mkdirSync(outDir, { recursive: true });

const allSlugs = new Set(), allTitles = new Map();
const manifest = { gen: PUB, clusters: {}, totalNew: 0 };
let total = 0;

for (const cname of CLUSTERS) {
  const d = require(path.join(__dirname, "..", "posts", "gen_data_" + cname + ".js"));
  const d2path = path.join(__dirname, "..", "posts", "gen_data2_" + cname + ".js");
  if (fs.existsSync(d2path)) { const d2 = require(d2path); if (!Array.isArray(d2.subjects)) throw new Error(cname + ": gen_data2 subjects missing"); d.subjects = d.subjects.concat(d2.subjects); }
  const target = TARGETS[cname];
  if (d.groups.length !== 17) throw new Error(cname + ": groups != 17");

  // --- أزواج (subject × fmt) ---
  const pairs = [];
  d.subjects.forEach((s, si) => {
    if (!s.f || !s.f.length) throw new Error(cname + " subject without fmt: " + s.slug);
    s.f.forEach((fmt) => {
      if (!d.fmtNames[fmt]) throw new Error(cname + ": unknown fmt " + fmt + " in " + s.slug);
      pairs.push({ si, gi: d.groups.findIndex((g) => g.slug === s.g), fmt, s });
    });
  });

  // --- تعبئة حتى الحدّ بدقة (مستويات صفات مؤهّلة) ---
  const quals = qualPool(d, cname);
  const variants = [];
  outer: for (let lvl = 0; variants.length < target; lvl++) {
    if (lvl >= quals.length) throw new Error(cname + ": qualifier pool exhausted");
    for (const p of pairs) {
      if (variants.length >= target) break outer;
      variants.push({ p, q: quals[lvl], lvl });
    }
  }

  // --- اختيار العميقة: توزيع دوري على المجموعات من المستوى الأساسي (بدون صفة) ---
  const deepSet = new Set();
  const baseIdx = variants.map((v, i) => (v.lvl === 0 ? i : -1)).filter((i) => i >= 0);
  const byGroup = new Map();
  for (const i of baseIdx) {
    const g = variants[i].p.gi;
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(i);
  }
  const gorder = [...byGroup.keys()].sort((a, b) => a - b);
  let placed = 0, round = 0;
  while (placed < DEEP_PER && round < 1000) {
    let any = false;
    for (const g of gorder) {
      const list = byGroup.get(g);
      // تفضيل صيغ الأعمق داخل المجموعة
      const sorted = list.slice().sort((a, b) =>
        (FMT_PREF.indexOf(variants[a].p.fmt) + 1e3 * variants[a].p.si) -
        (FMT_PREF.indexOf(variants[b].p.fmt) + 1e3 * variants[b].p.si));
      if (sorted[round] !== undefined) {
        deepSet.add(sorted[round]); placed++; any = true;
        if (placed >= DEEP_PER) break;
      }
    }
    if (!any) break;
    round++;
  }
  if (placed < DEEP_PER) throw new Error(cname + ": only " + placed + " deep selected");

  // --- بناء المواصفات ---
  const specs = [];
  const groupSubjects = new Map(); // gi -> [subject]
  d.subjects.forEach((s) => {
    const gi = d.groups.findIndex((g) => g.slug === s.g);
    if (!groupSubjects.has(gi)) groupSubjects.set(gi, []);
    groupSubjects.get(gi).push(s);
  });
  const giList = [...groupSubjects.keys()].sort((a, b) => a - b);

  variants.forEach((v, vi) => {
    const { p, q, lvl } = v;
    const s = p.s;
    const deep = deepSet.has(vi);
    const qualNone = !q || q.none;
    const sp = qualNone ? s.s : `${s.s} ${q.s}`;
    const h = hash(cname + "|" + s.slug + "|" + p.fmt + "|" + lvl);

    // slug
    const slug = [s.slug, qualNone ? null : q.slug, p.fmt].filter(Boolean).join("-");
    if (slug.length > 90) throw new Error(cname + ": slug too long " + slug);

    // title
    const fn = d.fmtNames[p.fmt];
    let title = fn.title.replace(/\{s\}/g, sp) + SUFFIX;
    if (title.length > TITLE_MAX) title = `${fn.short} ${sp}${SUFFIX}`;
    if (title.length > TITLE_MAX) throw new Error(cname + ": title too long " + title);

    // desc
    const tpl = pick(d.descTpl[p.fmt], h + lvl);
    const desc = trimDesc(tpl.replace(/\{s\}/g, sp));
    if (!desc || desc.length < 60) throw new Error(cname + ": bad desc for " + slug);

    // kw
    const kw = qualNone ? s.kw : `${s.kw}, ${q.kw}`;

    // lead
    const thesis = pick(d.theses[p.fmt], h + lvl);
    const fits = deep ? d.openers.filter((o) => openerFits(o, s)) : [];
    const lead = deep
      ? `${fits.length ? pick(fits, h) + " " : ""}${thesis} ${s.l}`
      : `${s.l} ${qualTail(q)}${qualTail(q) ? " " : ""}${thesis}`;
    if (lead.length > 520) throw new Error(cname + ": lead too long " + slug);

    // points ×3 (دوران حسب الزوج+المستوى)
    const pkey = PT[p.fmt] || "guide";
    const pbucket = d.points[pkey] || d.points.guide || Object.values(d.points)[0];
    const start = h + lvl;
    const points = [0, 1, 2].map((i) => pick(pbucket, start + i));
    if (new Set(points).size !== 3) {
      // ضمان ثلاثة بنود مختلفة
      const alt = pbucket.filter((x) => !points.includes(x));
      points[2] = alt.length ? pick(alt, start) : points[2];
    }

    // apply
    const apply = pick(d.points.apply, h + lvl);

    // faq: عميقة 3 / منهجية 2
    const nf = deep ? 3 : 2;
    const faq = [];
    for (let i = 0; i < nf; i++) faq.push(pick(d.points.faq, h + lvl + i));
    if (faq.length === 2 && faq[0][0] === faq[1][0]) faq[1] = pick(d.points.faq, h + lvl + 3);

    specs.push({
      slug, title, desc, kw, short: sp, lead, points, apply, faq,
      cluster: cname, pub: PUB, _tier: deep ? 0 : 1, _g: p.gi, _s: p.si, _f: p.fmt, _lvl: lvl,
      _hs: groupSubjects.get(p.gi), _subj: s, _gi: p.gi
    });
  });

  // --- روابط داخلية: جار من المجموعة + جار من مجموعة أخرى (عميقة: + أداة) ---
  specs.forEach((sp, i) => {
    const h = hash(sp.slug);
    const mates = sp._hs.filter((x) => x.slug !== sp._subj.slug);
    const a = mates.length ? pick(mates, h) : d.subjects[(h + 1) % d.subjects.length];
    let bi = (sp._gi + 1 + (h % (giList.length - 1))) % giList.length;
    if (bi === sp._gi) bi = (bi + 1) % giList.length;
    const pool2 = groupSubjects.get(giList[bi]) || [];
    const b = pool2.length ? pick(pool2, h + 7) : null;
    // Subject slugs are not published article slugs: every public page appends
    // its format/qualifier. Resolve links to an actual generated variant so we
    // never emit links to phantom /articles/<subject>/ routes.
    const publishedVariant = (subject, seed) => {
      if (!subject) return null;
      const candidates = specs.filter((candidate) => candidate._subj.slug === subject.slug);
      return candidates.length ? pick(candidates, seed) : null;
    };
    const aPage = publishedVariant(a, h);
    const bPage = publishedVariant(b, h + 7);
    const links = aPage ? [[`/articles/${aPage.slug}/`, a.s]] : [];
    if (bPage && (!aPage || bPage.slug !== aPage.slug)) links.push([`/articles/${bPage.slug}/`, b.s]);
    else links.push(TOOLS[i % TOOLS.length]);
    if (sp._tier === 0) links.push(TOOLS[(h + 1) % TOOLS.length]);
    sp.links = links;
  });

  // --- ترتيب الإخراج: عميقة ثم تسلسل المجموعة/الموضوع/الصيغة/المستوى ---
  specs.sort((a, b) =>
    a._tier - b._tier || a._g - b._g || a._s - b._s ||
    FMT_PREF.indexOf(a._f) - FMT_PREF.indexOf(b._f) || a._lvl - b._lvl);

  // ================= بوابات التشابه =================
  const sSlugs = new Set(), sTitles = new Set(), sDescs = new Map();
  for (const sp of specs) {
    if (sSlugs.has(sp.slug)) throw new Error(cname + ": DUPLICATE slug " + sp.slug);
    sSlugs.add(sp.slug);
    if (sTitles.has(sp.title)) throw new Error(cname + ": DUPLICATE title " + sp.title);
    sTitles.add(sp.title);
    sDescs.set(sp.desc, (sDescs.get(sp.desc) || 0) + 1);
    if (sp.links.length < 2) throw new Error(cname + ": links < 2 " + sp.slug);
    if (!sp.faq.length) throw new Error(cname + ": faq empty " + sp.slug);
    if (allSlugs.has(sp.slug)) throw new Error("GLOBAL: duplicate slug " + sp.slug);
    allSlugs.add(sp.slug);
    if (allTitles.has(sp.title)) throw new Error("GLOBAL: duplicate title " + sp.title);
    allTitles.set(sp.title, cname);
    const badTxt = [sp.title, sp.desc, sp.lead, ...sp.points].join(" ").match(/[\u3040-\u30ff\u3400-\u9fff\u0400-\u04ff]/);
    if (badTxt) throw new Error(cname + ": foreign script in " + sp.slug);
  }
  const maxDescDup = Math.max(...sDescs.values());
  if (maxDescDup > 1) throw new Error(cname + ": desc duplicated " + maxDescDup + "×");

  const deepN = specs.filter((x) => x._tier === 0).length;
  if (specs.length !== target) throw new Error(cname + ": count " + specs.length + " != " + target);
  if (deepN !== DEEP_PER) throw new Error(cname + ": deep " + deepN + " != " + DEEP_PER);

  // إخراج نظيف (حقول داخلية محذوفة)
  const clean = specs.map((sp) => ({
    slug: sp.slug, title: sp.title, desc: sp.desc, kw: sp.kw, short: sp.short,
    lead: sp.lead, points: sp.points, apply: sp.apply, faq: sp.faq,
    links: sp.links, cluster: sp.cluster, group: d.groups[sp._g].slug,
    fmtS: d.fmtNames[sp._f].short, pub: sp.pub, tier: sp._tier === 0 ? "deep" : "methodical"
  }));
  fs.writeFileSync(path.join(outDir, cname + ".json"), JSON.stringify(clean));
  manifest.clusters[cname] = {
    target, count: clean.length, deep: deepN, methodical: clean.length - deepN,
    subjects: d.subjects.length, groups: 17, pairs: pairs.length,
    cap: Math.ceil(target / pairs.length)
  };
  total += clean.length;
  console.log(`${cname.padEnd(11)} ${clean.length} (deep ${deepN} + meth ${clean.length - deepN}) pairs=${pairs.length} cap=${manifest.clusters[cname].cap} ✓`);
}

manifest.totalNew = total;
manifest.totalWithOld = total + 500;
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
if (total !== 19500) throw new Error("TOTAL " + total + " != 19500");
console.log(`\nTOTAL new: ${total} (+500 old = ${manifest.totalWithOld}) — global gates: slugs ✓ titles ✓ descs ✓`);
console.log("written → posts/out/*.json + manifest.json");

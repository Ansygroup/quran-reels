/* ============================================================
 * build_posts.js — محرّك مقالات «المكتبة» /articles/ (كمل#20 · ترقية كمل#24)
 * يقرأ: posts/index.js (500 أصلية) + posts/out/*.json (19,500 من المحرك) + posts/gen_data_*.js (بيانات البوابات)
 * يكتب: public/articles/<slug>/index.html × 20,000
 *        + public/articles/index.html (الرئيسية: 8 عناقيد + أرشيف الصفحات المادية خارج المجموعة)
 *        + public/articles/<group>/index.html × 136 (بوابات المحاور)
 * داخل المقال: مقدمة فريدة + نقاط فريدة + قسمان (العميقة: ثلاثة) من بنوك العناقيد +
 * تطبيق فريد + خطوات + FAQ (FAQPage LD) + ترابط تلقائي (ذات صلة + أداة + محور المجموعة).
 * الصور: إن وُجد public/img/articles/<slug>.jpg يُستخدم hero+og، وإلا بانر CSS.
 * ============================================================ */
const { hdrNav } = require("./site_nav.js");
const fs = require("fs");
const path = require("path");
const { clusters } = require("../posts/library.js");
const OLD = require("../posts/index.js");

const ORIGIN = "https://quran-reels-tau.vercel.app";
const VERIF = "IHmoe5QFrC77PbZdh2O0MeZFLIKwg-saA50td32AcQo";
const ICON = "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2064%2064'%3E%3Crect%20width='64'%20height='64'%20rx='16'%20fill='%23050f0c'/%3E%3Cpath%20d='M44%2014a20%2020%200%201%200%206%2026A16%2016%200%201%201%2044%2014z'%20fill='%23e6c46a'/%3E%3Ccircle%20cx='46'%20cy='22'%20r='3'%20fill='%23e6c46a'/%3E%3C/svg%3E";
const PUB = "2026-10-30";
const PUB_ISO = "2026-10-30T09:00:00+02:00";
const CLUSTERS = ["video", "reciters", "prayer", "hifz", "azkar", "seasons", "family", "publishing"];
const TITLE_SUFFIX_RE = /\s*\|\s*قرآن ريلز$/;

/* — تحميل 19,500 من المحرك — */
const OUT_DIR = path.join(__dirname, "..", "posts", "out");
const NEW = [];
for (const c of CLUSTERS) {
  NEW.push(...JSON.parse(fs.readFileSync(path.join(OUT_DIR, c + ".json"), "utf8")));
}
const SPECS = [...OLD, ...NEW];
if (SPECS.length !== 20000) throw new Error("SPECS != 20000: " + SPECS.length);
{
  const ss = new Set(), tt = new Set();
  for (const s of SPECS) {
    if (ss.has(s.slug)) throw new Error("dup slug: " + s.slug);
    ss.add(s.slug);
    if (tt.has(s.title)) throw new Error("dup title: " + s.title);
    tt.add(s.title);
  }
}

/* — بيانات المحاور من gen_data — */
const GEN = {};
const GROUPS = new Map(); // slug -> {name, desc, cluster}
for (const c of CLUSTERS) {
  GEN[c] = require(path.join(__dirname, "..", "posts", "gen_data_" + c + ".js"));
  for (const g of GEN[c].groups) {
    if (GROUPS.has(g.slug)) throw new Error("dup group slug: " + g.slug);
    GROUPS.set(g.slug, { name: g.name, desc: g.desc, cluster: c });
  }
}

/* — فهرس العنقود (للترابط) + فهرس المحور — */
const byCluster = new Map();
for (const s of SPECS) {
  if (!byCluster.has(s.cluster)) byCluster.set(s.cluster, []);
  byCluster.get(s.cluster).push(s);
}
const byGroup = new Map();
for (const s of NEW) {
  if (!byGroup.has(s.group)) byGroup.set(s.group, []);
  byGroup.get(s.group).push(s);
}
if (byGroup.size !== 136) throw new Error("groups != 136: " + byGroup.size);

// Validate authored internal links before emitting HTML. Old content data can
// outlive its destination page; only link to known article/group slugs or files.
const VALID_ARTICLE_SLUGS = new Set([...SPECS.map((s) => s.slug), ...GROUPS.keys()]);
const PUBLIC_DIR = path.join(__dirname, "..", "public");
function hasPublishedTarget(href) {
  let u;
  try { u = new URL(href, ORIGIN); } catch (e) { return false; }
  if (u.origin !== ORIGIN) return true;
  const pathname = decodeURIComponent(u.pathname);
  if (pathname === "/articles/") return true;
  const article = pathname.match(/^\/articles\/([^/]+)\/$/);
  if (article) return VALID_ARTICLE_SLUGS.has(article[1]);
  const rel = pathname.replace(/^\/+/, "");
  const target = path.join(PUBLIC_DIR, rel);
  return fs.existsSync(target) || fs.existsSync(path.join(target, "index.html"));
}

const STYLE = `
  .lp-hero{padding:52px 6% 26px;text-align:center;background:radial-gradient(700px 250px at 50% -50px, rgba(212,175,55,.13), transparent 72%),linear-gradient(180deg, rgba(255,255,255,.035), transparent 75%);border-bottom:1px solid var(--line)}
  .lp-hero h1{font-size:clamp(1.6rem,4.2vw,2.4rem);font-weight:900;margin-bottom:12px}
  .lp-hero p.lead{max-width:760px;margin:0 auto 18px;color:var(--muted);font-size:1.03rem;line-height:1.95}
  .lp-cta{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px}
  .art-meta{max-width:760px;margin:0 auto;text-align:center;font-size:.85rem;color:var(--muted)}
  .hero-svg{display:block;max-width:720px;width:100%;margin:18px auto 0;border-radius:16px;border:1px solid var(--line-2);background:#07130f}
  .hero-img{display:block;max-width:640px;width:100%;margin:18px auto 0;border-radius:16px;border:1px solid var(--line-2);aspect-ratio:16/9;object-fit:cover}
  .lp-sec{max-width:840px;margin:26px auto}
  .lp-sec h2{font-size:1.3rem;font-weight:800;margin:26px 0 10px;color:var(--gold-3)}
  .lp-sec h2::after{content:'';display:block;width:56px;height:3px;border-radius:3px;background:var(--grad-gold);margin-top:8px}
  .lp-sec h3{font-size:1.05rem;font-weight:700;margin:18px 0 8px;color:var(--gold-3)}
  .lp-sec p,.lp-sec li{line-height:2.05;color:var(--muted);font-size:.97rem}
  .lp-sec ul,.lp-sec ol{padding-right:22px}
  .lp-sec ol li{margin-bottom:6px}
  .feat{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin:18px 0}
  .feat div{background:var(--panel);border:1px solid var(--line-2);border-radius:14px;padding:14px 16px;font-size:.92rem;color:var(--muted);line-height:1.85;transition:transform .18s ease,border-color .18s ease,background .18s ease}
  .feat div:hover{transform:translateY(-3px);border-color:var(--line);background:var(--panel-2)}
  .feat b{color:var(--gold-3);display:block;margin-bottom:4px;font-size:.98rem}
  .qa{background:var(--panel);border:1px solid var(--line-2);border-inline-start:3px solid rgba(212,175,55,.55);border-radius:14px;padding:2px 20px 8px;margin:10px 0}
  .qa h3{font-size:1.02rem;font-weight:800;color:var(--gold-3);margin:14px 0 6px}
  .qa p{color:var(--muted);line-height:1.95;font-size:.94rem;margin:0 0 10px}
  .lp-links{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:26px}
  .lp-links a{border:1px solid var(--line-2);border-radius:99px;padding:7px 16px;font-size:.86rem;color:var(--gold-3);text-decoration:none;transition:background .15s,border-color .15s,transform .15s}
  .lp-links a:hover{background:rgba(212,175,55,.15);border-color:rgba(212,175,55,.45);transform:translateY(-2px)}
  .callout{background:rgba(212,175,55,.06);border:1px solid var(--line);border-radius:14px;padding:12px 18px;margin:16px 0;color:var(--muted);font-size:.95rem;line-height:1.95}
  .callout b{color:var(--gold-3)}
  .crumb{font-size:.86rem;color:var(--muted);margin:16px 0 -4px}
  .crumb a{color:var(--gold-3);text-decoration:none}
  .rc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;margin:16px 0}
  .rc-card{display:block;background:var(--panel);border:1px solid var(--line-2);border-radius:12px;padding:13px 15px;color:var(--muted);text-decoration:none;font-size:.9rem;line-height:1.7;transition:border-color .15s,transform .15s}
  .rc-card:hover{border-color:var(--gold-3);transform:translateY(-2px)}
  .rc-card b{display:block;color:var(--gold-3);font-size:.98rem;margin-bottom:3px}
  .rc-card i{font-style:normal;font-size:.78rem;opacity:.85;display:block;margin-top:4px}
  .cl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;margin:18px 0}
  .cl-card{background:var(--panel);border:1px solid var(--line-2);border-radius:16px;padding:18px 20px;transition:border-color .15s,transform .15s}
  .cl-card:hover{border-color:var(--gold-3);transform:translateY(-2px)}
  .cl-card h3{color:var(--gold-3);font-size:1.08rem;font-weight:800;margin:0 0 6px}
  .cl-card h3 a{color:inherit;text-decoration:none}
  .cl-card p{color:var(--muted);font-size:.88rem;line-height:1.8;margin:0 0 10px}
  .chips{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:16px 0}
  .chips a{border:1px solid var(--line-2);border-radius:99px;padding:6px 14px;font-size:.83rem;color:var(--gold-3);text-decoration:none;background:var(--panel)}
  .chips a:hover{background:rgba(212,175,55,.14);border-color:rgba(212,175,55,.45)}
  .badge{display:inline-block;font-size:.72rem;background:rgba(212,175,55,.14);color:var(--gold-3);border-radius:6px;padding:1px 8px;margin-inline-start:6px;vertical-align:middle}
  .crumb a,.lp-sec p a,.lp-sec li a,.callout a,.qa a,.foot-bottom a{text-decoration:underline;text-underline-offset:3px;text-decoration-color:rgba(212,175,55,.6)}
  :focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  ::selection{background:rgba(212,175,55,.35);color:#fff}
  @media (prefers-reduced-motion:reduce){.feat,.lp-links a,.rc-card,.cl-card{transition:none}}
`;

/* — ورقة أنماط مشتركة (تُكتب من STYLE ليبقى المصدر واحدًا) — */
fs.writeFileSync(path.join(__dirname, "..", "public", "css", "articles.css"), "/* build_posts STYLE — مولّد تلقائيًّا */\n" + STYLE);

const FOOT = `<span>© 2026 قرآن ريلز — <a href="/" style="color:var(--gold-3)">الصفحة الرئيسية</a> · <a href="/ar/quran-video-maker/" style="color:var(--gold-3)">صانع الفيديو</a> · <a href="/ar/reciters/" style="color:var(--gold-3)">القرّاء</a> · <a href="/articles/" style="color:var(--gold-3)">المكتبة</a> · <a href="/blog/" style="color:var(--gold-3)">المدونة</a> · <a href="/ar/islamic-tools/" style="color:var(--gold-3)">الأدوات</a> · <a href="/about/" style="color:var(--gold-3)">عنّا</a> · <a href="/contact/" style="color:var(--gold-3)">تواصل</a> · <a href="/privacy/" style="color:var(--gold-3)">خصوصية</a></span>`;

const HEAD_EXTRA = `<meta property="og:site_name" content="قرآن ريلز">
<meta property="og:locale" content="ar_AR">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#050f0c">
<link rel="icon" href="${ICON}">
<link rel="apple-touch-icon" href="/img/icon-192.png?v=2">
<link rel="stylesheet" href="/css/style.css?v=3">
<link rel="stylesheet" href="/css/articles.css?v=1">
<script defer src="/_vercel/insights/script.js"></script>
<script defer src="/_vercel/speed-insights/script.js"></script>
<script src="https://quge5.com/88/tag.min.js" data-zone="303174" async data-cfasync="false"></script>`;

const HEADER = `<div class="topbar">☽ صدقة جارية على نبيّنا محمد ﷺ · الموقع مجاني 100%</div>
<header class="site-header">
  <div class="container header-in">
    <a class="brand" href="/">
      <span class="brand-logo"><svg viewBox="0 0 64 64" fill="none"><path d="M46 10a22 22 0 1 0 7 30A17.5 17.5 0 1 1 46 10z" fill="#1d1403"/><circle cx="49" cy="19" r="3.4" fill="#1d1403"/></svg></span>
      <span>قرآن ريلز<small>مكتبة المقالات</small></span>
    </a>
    ${hdrNav("ar")}
    <a class="btn btn-em" href="/#/">🎬 ابدأ الآن</a>
  </div>
</header>`;

const FOOTER = `<footer class="footer" style="margin-top:30px">
  <div class="container foot-bottom">
    ${FOOT}
    <span>﴿ إِنَّ اللَّهَ مَعَ الصَّابِرِينَ ﴾</span>
  </div>
</footer>`;

const wordsOf = (s) => (s.replace(/<[^>]+>/g, " ").match(/[؀-ۿA-Za-z]+/g) || []).length;
const uniq = (a) => [...new Set(a)];
const h1Of = (spec) => (spec.h1 || spec.title).replace(TITLE_SUFFIX_RE, "");

/* — بطاقة SVG مضمّنة حين لا توجد صورة AI (بديل الهيرو — بلا ملفات إضافية) — */
function escXml(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function wrapText(s, maxLen, maxLines) {
  const words = String(s).split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxLen) cur += " " + w;
    else { lines.push(cur); cur = w; }
    if (lines.length === maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  else if (cur) lines[lines.length - 1] += " " + cur;
  return lines;
}
function heroSvg(spec) {
  const C = clusters[spec.cluster];
  const label = spec.short || h1Of(spec);
  const lines = wrapText(label, 34, 3);
  const fs0 = lines.some((l) => l.length > 30) ? 44 : lines.some((l) => l.length > 22) ? 54 : 62;
  const startY = 340 - (lines.length - 1) * (fs0 + 12) / 2;
  const tspans = lines.map((l, i) => `<tspan x="600" dy="${i === 0 ? 0 : fs0 + 12}">${escXml(l)}</tspan>`).join("");
  return `<svg class="hero-svg" viewBox="0 0 1200 675" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="hsg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b1f18"/><stop offset=".55" stop-color="#071310"/><stop offset="1" stop-color="#050f0c"/>
    </linearGradient>
    <radialGradient id="hgr" cx=".5" cy="0" r="1">
      <stop offset="0" stop-color="#e6c46a" stop-opacity=".22"/><stop offset="1" stop-color="#e6c46a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="675" fill="url(#hsg)"/>
  <rect width="1200" height="675" fill="url(#hgr)"/>
  <rect x="26" y="26" width="1148" height="623" rx="22" fill="none" stroke="#e6c46a" stroke-opacity=".45" stroke-width="2"/>
  <text x="600" y="120" text-anchor="middle" font-family="Tahoma,Arial,sans-serif" font-size="30" font-weight="700" fill="#e6c46a" opacity=".92">☾ قرآن ريلز</text>
  <text y="${startY}" text-anchor="middle" font-family="Tahoma,Arial,sans-serif" font-size="${fs0}" font-weight="800" fill="#f6efdd">${tspans}</text>
  <text x="600" y="600" text-anchor="middle" font-family="Tahoma,Arial,sans-serif" font-size="30" fill="#e6c46a" opacity=".85">${escXml(C.name)} · ${escXml(spec.fmtS || "")}</text>
</svg>`;
}

/* — تجميع جسم المقال لمواصفة — */
function bodyFor(spec, idx) {
  const C = clusters[spec.cluster];
  if (!C) throw new Error("no cluster: " + spec.cluster);
  const n = C.sections.length;
  const s1 = C.sections[idx % n];
  const s2 = C.sections[(idx + 3) % n];
  const deep = spec.tier === "deep";
  const s3 = deep ? C.sections[(idx + 7) % n] : null;
  const hero = fs.existsSync(path.join(__dirname, "..", "public", "img", "articles", spec.slug + ".jpg"));
  const heroMarkup = hero ? `<img class="hero-img" src="/img/articles/${spec.slug}.jpg" alt="${h1Of(spec).replace(/"/g, "")}" width="1536" height="1024" loading="lazy" decoding="async">` : heroSvg(spec);

  const same = byCluster.get(spec.cluster) || SPECS;
  const pick = [same[(idx + 1) % same.length], same[(idx + 5) % same.length], same[(idx + 9) % same.length]]
    .filter((x) => x && x.slug !== spec.slug)
    .filter((x, k, arr) => arr.findIndex((y) => y.slug === x.slug) === k)
    .slice(0, 3);

  const apply = spec.apply.replace(/\{t\}/g, spec.short || spec.h1);
  const hookLead = spec.lead.replace(/\{t\}/g, spec.short || spec.h1);
  const T = spec.short || spec.h1;
  const authoredLinks = (spec.links || []).filter(([href]) => hasPublishedTarget(href)).slice(0, 3);
  for (const related of pick) {
    if (authoredLinks.length >= 2) break;
    const href = `/articles/${related.slug}/`;
    if (!authoredLinks.some(([existing]) => existing === href)) authoredLinks.push([href, related.short || related.title]);
  }

  return `
${heroMarkup}
  <section class="lp-sec">
    <h2>${spec.hookTitle || (deep && spec.fmtS ? `${spec.fmtS}: لماذا يهمّ ${spec.short}؟` : "لماذا يهمّ هذا الموضوع؟")}</h2>
    <p>${hookLead}</p>
    <p>${C.intro.replace(/\{t\}/g, T)}</p>
    <ul>
${spec.points.map((p) => `      <li>${p}</li>`).join("\n")}
    </ul>
  </section>
  <section class="lp-sec">
    <h2>${s1.h.replace(/\{t\}/g, T)}</h2>
${s1.p.map((x) => `    <p>${x.replace(/\{t\}/g, T)}</p>`).join("\n")}
  </section>
  <section class="lp-sec">
    <h2>${s2.h.replace(/\{t\}/g, T)}</h2>
${s2.p.map((x) => `    <p>${x.replace(/\{t\}/g, T)}</p>`).join("\n")}
  </section>
${deep && s3 ? `  <section class="lp-sec">
    <h2>${s3.h.replace(/\{t\}/g, T)}</h2>
${s3.p.map((x) => `    <p>${x.replace(/\{t\}/g, T)}</p>`).join("\n")}
  </section>
` : ""}  <section class="lp-sec">
    <h2>كيف تطبّقها على «${T}»؟</h2>
    <p>${apply}</p>
    <div class="callout"><b>تطبيق عملي فوري:</b> ${C.toolLine.replace(/\{t\}/g, T)} — <a href="${C.tool.h}" style="color:var(--gold-3)">${C.tool.t}</a>.</div>
    <h3>خطوات مرقّمة</h3>
    <ol>
${C.steps.map((x) => `      <li>${x.replace(/\{t\}/g, T)}</li>`).join("\n")}
    </ol>
  </section>
  <section class="lp-sec">
    <h2>اقرأ أيضًا (روابط داخلية مختارة)</h2>
    <ul>
${authoredLinks.map(([h, t]) => `      <li><a href="${h}">${t}</a></li>`).join("\n")}
      <li><a href="/articles/">مكتبة المقالات كاملة</a> — وكل مقال في العناقيد يربط جارَه في النهاية.</li>
    </ul>
  </section>
  <section class="lp-sec">
    <h2>مقالات ذات صلة</h2>
    <div class="rc-grid">
${pick.map((r) => `      <a class="rc-card" href="/articles/${r.slug}/"><b>${r.short || r.title}</b><i>${r.desc.slice(0, 90)}…</i></a>`).join("\n")}
    </div>
  </section>`;
}

/* كمل#21: AR->EN twin map for hreflang */
let EN_SPECS = [];
try { EN_SPECS = require("../posts/en.js"); } catch (e) {}
const AR2EN = new Map(EN_SPECS.map((e) => [e.arTwin, e.slug]));

function articlePage(spec, idx) {
  const loc = ORIGIN + "/articles/" + spec.slug + "/";
  const C = clusters[spec.cluster];
  const G = spec.group ? GROUPS.get(spec.group) : null;
  const heroFile = "img/articles/" + spec.slug + ".jpg";
  const hasHero = fs.existsSync(path.join(__dirname, "..", "public", heroFile));
  const ogImg = hasHero ? ORIGIN + "/" + heroFile : ORIGIN + "/img/og-cover.jpg?v=2";
  const body = bodyFor(spec, idx);
  const read = Math.max(3, Math.round(wordsOf(body + spec.desc) / 180));
  const faq = [...spec.faq, [C.faqQ.replace(/\{t\}/g, spec.short || spec.h1), C.faqA.replace(/\{t\}/g, spec.short || spec.h1)]];
  const h1 = h1Of(spec);
  const crumbLD = G
    ? `[{"@type":"ListItem","position":1,"name":"الرئيسية","item":"${ORIGIN}/"},{"@type":"ListItem","position":2,"name":"المكتبة","item":"${ORIGIN}/articles/"},{"@type":"ListItem","position":3,"name":${JSON.stringify(G.name)},"item":"${ORIGIN}/articles/${spec.group}/"},{"@type":"ListItem","position":4,"name":${JSON.stringify(h1)},"item":"${loc}"}]`
    : `[{"@type":"ListItem","position":1,"name":"الرئيسية","item":"${ORIGIN}/"},{"@type":"ListItem","position":2,"name":"المكتبة","item":"${ORIGIN}/articles/"},{"@type":"ListItem","position":3,"name":${JSON.stringify(h1)},"item":"${loc}"}]`;
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${spec.title}</title>
<meta name="description" content="${spec.desc}">
<meta name="keywords" content="${spec.kw}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${loc}">
${AR2EN.has(spec.slug) ? `<link rel="alternate" hreflang="ar" href="${loc}">\n<link rel="alternate" hreflang="en" href="${ORIGIN}/en/articles/${AR2EN.get(spec.slug)}/">` : ""}
<meta name="google-site-verification" content="${VERIF}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="قرآن ريلز">
<meta property="og:locale" content="ar_AR">
<meta property="og:title" content="${spec.title}">
<meta property="og:description" content="${spec.desc}">
<meta property="og:url" content="${loc}">
<meta property="og:image" content="${ogImg}">
<meta property="article:published_time" content="${PUB_ISO}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${spec.title}">
<meta name="twitter:description" content="${spec.desc}">
<meta name="twitter:image" content="${ogImg}">
<meta name="theme-color" content="#050f0c">
<link rel="icon" href="${ICON}">
<link rel="apple-touch-icon" href="/img/icon-192.png?v=2">
<link rel="stylesheet" href="/css/style.css?v=3">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Article","headline":${JSON.stringify(spec.title)},"description":${JSON.stringify(spec.desc)},"datePublished":"${PUB_ISO}","dateModified":"${PUB_ISO}","keywords":${JSON.stringify(spec.kw)},"timeRequired":"PT${read}M","isPartOf":{"@type":"CollectionPage","@id":"${ORIGIN}/articles/","name":"مكتبة مقالات قرآن ريلز"},"inLanguage":"ar","mainEntityOfPage":{"@type":"WebPage","@id":"${loc}"},"image":"${ogImg}","author":{"@type":"Organization","name":"قرآن ريلز","url":"${ORIGIN}/"},"publisher":{"@type":"Organization","name":"قرآن ريلز","url":"${ORIGIN}/","logo":{"@type":"ImageObject","url":"${ORIGIN}/img/og-cover.jpg?v=2"}}}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":${crumbLD}}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
${faq.map(([q, x]) => `{"@type":"Question","name":${JSON.stringify(q)},"acceptedAnswer":{"@type":"Answer","text":${JSON.stringify(x)}}}`).join(",\n")}
]}
</script>
${HEAD_EXTRA}
</head>
<body>
${HEADER}
<main class="container">
  <div class="crumb"><a href="/">الرئيسية</a> ← <a href="/articles/">المكتبة</a>${G ? ` ← <a href="/articles/${spec.group}/">${G.name}</a>` : ""} ← ${h1}</div>
  <section class="lp-hero">
    <h1>${h1}</h1>
    <p class="lead">${spec.lead.replace(/\{t\}/g, spec.short || spec.h1)}</p>
    <p class="art-meta">بقلم <b>قرآن ريلز</b> · <time datetime="${PUB_ISO}">٣٠ أكتوبر ٢٠٢٦</time> · ${read} دقائق قراءة · عناقيد: ${C.name}</p>
    <div class="lp-cta"><a class="btn btn-em" href="${C.tool.h}">${C.tool.t}</a><a class="btn btn-soft" href="/articles/">📚 المكتبة</a></div>
  </section>
${body}
  <section class="lp-sec">
    <h2>الأسئلة الشائعة</h2>
    ${faq.map(([q, x]) => `<div class="qa"><h3>${q}</h3><p>${x}</p></div>`).join("\n    ")}
  </section>
  <div class="lp-links">
    <a href="/articles/">📚 كل المقالات</a>
${G ? `    <a href="/articles/${spec.group}/">🗂 ${G.name}</a>\n` : ""}${C.clusterLinks.filter(([h]) => hasPublishedTarget(h)).map(([h, t]) => `    <a href="${h}">${t}</a>`).join("\n")}
  </div>
</main>
${FOOTER}
</body>
</html>
`;
}

/* — الصفحة الرئيسية للمكتبة: 8 عناقيد + 136 محورًا + عينات — */
function hubPage() {
  const loc = ORIGIN + "/articles/";
  const nTotal = SPECS.length;
  const knownSlugs = new Set([...SPECS.map((s) => s.slug), ...GROUPS.keys()]);
  const articleRoot = path.join(PUBLIC_DIR, "articles");
  const decodeText = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const legacyEntries = fs.readdirSync(articleRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^[a-z0-9-]+$/.test(d.name) && !knownSlugs.has(d.name))
    .map((d) => {
      const src = fs.readFileSync(path.join(articleRoot, d.name, "index.html"), "utf8");
      const titleMatch = src.match(/<title[^>]*>(.*?)<\/title>/i);
      const descMatch = src.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
      const title = decodeText((titleMatch && titleMatch[1] || d.name).trim());
      const desc = decodeText(descMatch && descMatch[1] || "مقال من أرشيف مقالات قرآن ريلز.");
      return { slug: d.name, title, desc };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
  const legacyArchiveHTML = legacyEntries.map((e) =>
    `        <a class="rc-card" href="/articles/${e.slug}/"><b>${escXml(e.title)}</b><i>${escXml(Array.from(e.desc).slice(0, 100).join(""))}…</i></a>`
  ).join("\n");
  const clSections = CLUSTERS.map((c) => {
    const C = clusters[c];
    const all = byCluster.get(c) || [];
    const deepPicks = all.filter((s) => s.tier === "deep").slice(0, 6);
    const oldPicks = OLD.filter((s) => s.cluster === c).slice(0, 3);
    const gchips = GEN[c].groups.map((g) => `        <a href="/articles/${g.slug}/">${g.name}</a>`).join("\n");
    const cards = [...deepPicks, ...oldPicks].map((s) => `        <a class="rc-card" href="/articles/${s.slug}/"><b>${s.short || s.title}</b><i>${s.desc.slice(0, 100)}…</i></a>`).join("\n");
    // Legacy publishing guides were not assigned to a modern group hub. Keep
    // them directly crawlable from the library instead of relying on search JS.
    const legacyPublishing = c === "publishing"
      ? OLD.filter((s) => s.cluster === "publishing" && !oldPicks.some((p) => p.slug === s.slug))
          .map((s) => `        <a class="rc-card" href="/articles/${s.slug}/"><b>${s.short || s.title}</b><i>${s.desc.slice(0, 100)}…</i></a>`).join("\n")
      : "";
    return `    <section class="lp-sec" id="c-${c}">
      <h2>${C.name} <span class="badge">${all.length + OLD.filter((s) => s.cluster === c).length} مقالًا</span></h2>
      <p>${C.intro.replace(/\{t\}/g, C.name)}</p>
      <div class="chips">
${gchips}
      </div>
      <div class="rc-grid">
${cards}
      </div>
${legacyPublishing ? `      <h3>أدلة إضافية للقناة والنشر</h3>
      <p>روابط مباشرة إلى المقالات العملية المنشورة سابقًا، لتسهيل اكتشافها من فهرس المكتبة.</p>
      <div class="rc-grid">
${legacyPublishing}
      </div>
` : ""}    </section>`;
  }).join("\n");
  const hubLD = [...GROUPS.keys()].map((g, i) => `{"@type":"ListItem","position":${i + 1},"name":${JSON.stringify(GROUPS.get(g).name)},"url":"${ORIGIN}/articles/${g}/"}`).join(",\n");
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>مكتبة مقالات قرآن ريلز — ${nTotal} دليلًا عمليًا بالصور والروابط | قرآن ريلز</title>
<meta name="description" content="مكتبة المقالات: ${nTotal} دليلًا عمليًا في صناعة المقاطع القرآنية والحفظ والأذكار والصلاة والمواسم والأسرة والنشر — موزّعة على 136 محورًا بروابط داخلية و FAQs.">
<meta name="keywords" content="مقالات قرآن, مكتبة مقالات, ادلة عملية, مقالات صناعة الفيديو">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${loc}">
<link rel="alternate" hreflang="ar" href="${loc}">
<link rel="alternate" hreflang="en" href="${ORIGIN}/en/articles/">
<meta name="google-site-verification" content="${VERIF}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="قرآن ريلز">
<meta property="og:locale" content="ar_AR">
<meta property="og:title" content="مكتبة مقالات قرآن ريلز — ${nTotal} دليلًا عمليًّا">
<meta property="og:description" content="${nTotal} دليلًا عمليًا بالصور والروابط الداخلية في المقاطع القرآنية والحفظ والأذكار والمواسم.">
<meta property="og:url" content="${loc}">
<meta property="og:image" content="${ORIGIN}/img/og-cover.jpg?v=2">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#050f0c">
<link rel="icon" href="${ICON}">
<link rel="apple-touch-icon" href="/img/icon-192.png?v=2">
<link rel="stylesheet" href="/css/style.css?v=3">
<link rel="stylesheet" href="/css/articles.css?v=1">
<script defer src="/_vercel/insights/script.js"></script>
<script defer src="/_vercel/speed-insights/script.js"></script>
<script src="https://quge5.com/88/tag.min.js" data-zone="303174" async data-cfasync="false"></script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"CollectionPage","name":"مكتبة مقالات قرآن ريلز","url":"${loc}","inLanguage":"ar","isPartOf":{"@type":"WebSite","name":"قرآن ريلز","url":"${ORIGIN}/"},"mainEntity":{"@type":"ItemList","name":"محاور المكتبة","numberOfItems":${GROUPS.size},"itemListElement":[
${hubLD}
]}}
</script>
</head>
<body>
${HEADER}
<main class="container">
  <div class="crumb"><a href="/">الرئيسية</a> ← المكتبة</div>
  <section class="lp-hero">
    <h1>مكتبة المقالات — ${nTotal} دليلًا عمليًّا</h1>
    <p class="lead">محتوى مُهيّأ للبحث والاقتباس: مقالات مبنية على أنظمة عناقيد (فيديو · قرّاء · صلاة · حفظ · أذكار · مواسم · أسرة · نشر) — كل مقال بأسئلة شائعة وروابط داخلية وصورة عند توفرها.</p>
    <p class="art-meta">آخر تحديث: <time datetime="${PUB_ISO}">٣٠ أكتوبر ٢٠٢٦</time> · ${nTotal} مقالًا · 8 عناقيد · 136 محورًا</p>
    <div class="lp-cta"><a class="btn btn-em" href="/blog/">📚 المدونة</a><a class="btn btn-soft" href="/ar/quran-video-maker/">🎬 الصانع</a></div>
  </section>
<section class="lp-sec" id="find">
      <h2>ابحث في كل المقالات</h2>
      <p>اكتب موضوعك (رمضان، أذكار، قارئ، صلاة…) — النتائج من فهرس الـ${SPECS.length.toLocaleString("en")} مقالًا كلها.</p>
      <div class="hub-search"><input id="hubQ" class="input" type="search" placeholder="مثال: أذكار الصباح، زكاة، الحفظ…" autocomplete="off"></div>
      <div class="hub-res" id="hubRes"></div>
      <div class="chips" style="margin-top:14px">${CLUSTERS.map((c) => `<a href="#c-${c}">${clusters[c].name}</a>`).join("")}</div>
    </section>
    <script>
    (function(){
      var q=document.getElementById("hubQ"),out=document.getElementById("hubRes"),data=null,busy=false;
      function norm(s){return String(s).toLowerCase().replace(/[\u064B-\u0652]/g,"").replace(/[إأآ]/g,"ا");}
      function render(list){
        out.textContent="";
        list.slice(0,30).forEach(function(r){
          var a=document.createElement("a");a.className="rc-card";a.href="/articles/"+r[0]+"/";
          var b=document.createElement("b");b.textContent=r[1];
          var i=document.createElement("i");i.textContent=r[2];
          a.appendChild(b);a.appendChild(i);out.appendChild(a);
        });
        if(!list.length){var e=document.createElement("p");e.className="muted";e.textContent="لا نتائج — جرّب كلمة أعمّ.";out.appendChild(e);}
      }
      function run(){
        var t=norm(q.value.trim());
        if(!t){out.textContent="";return;}
        if(!data){
          if(busy)return; busy=true;
          fetch("/articles-index.json").then(function(r){return r.json();}).then(function(d){data=d;busy=false;run();});
          return;
        }
        var words=t.split(/\\s+/);
        render(data.filter(function(r){var h=norm(r[1]+" "+r[2]);return words.every(function(w){return h.indexOf(w)>-1;});}));
      }
      q.addEventListener("input",run);
    })();
    </script>
${clSections}
${legacyEntries.length ? `<section class="lp-sec" id="archive"><h2>أرشيف مقالات إضافي (${legacyEntries.length})</h2><p>روابط ثابتة لمقالات من دفعات سابقة، لتسهيل الوصول إليها واكتشافها.</p><div class="rc-grid">\n${legacyArchiveHTML}\n</div></section>` : ""}
</main>
${FOOTER}
</body>
</html>
`;
}

/* — بوابة محور (136) — */
function groupHubPage(gslug) {
  const meta = GROUPS.get(gslug);
  const C = clusters[meta.cluster];
  const arts = byGroup.get(gslug) || [];
  const loc = ORIGIN + "/articles/" + gslug + "/";
  const deepN = arts.filter((s) => s.tier === "deep").length;
  const title = `${meta.name} — ${arts.length} مقالًا عمليًّا | قرآن ريلز`;
  const desc = `${meta.desc} ${arts.length} مقالًا (${deepN} عميقًا) في هذا المحور: عناوين عملية وأسئلة شائعة وروابط داخلية.`.slice(0, 158);
  const siblings = GEN[meta.cluster].groups.filter((g) => g.slug !== gslug);
  const cards = arts.map((s) => `      <a class="rc-card" href="/articles/${s.slug}/"><b>${s.short}</b><i>${s.desc.slice(0, 100)}…</i>${s.tier === "deep" ? '<span class="badge">عميق</span>' : ""}</a>`).join("\n");
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta name="keywords" content="${meta.name}, ${C.name}, مقالات عملية">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${loc}">
<link rel="alternate" hreflang="ar" href="${loc}">
<meta name="google-site-verification" content="${VERIF}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="قرآن ريلز">
<meta property="og:locale" content="ar_AR">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${loc}">
<meta property="og:image" content="${ORIGIN}/img/og-cover.jpg?v=2">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#050f0c">
<link rel="icon" href="${ICON}">
<link rel="apple-touch-icon" href="/img/icon-192.png?v=2">
<link rel="stylesheet" href="/css/style.css?v=3">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"CollectionPage","name":${JSON.stringify(title)},"url":"${loc}","inLanguage":"ar","isPartOf":{"@type":"CollectionPage","@id":"${ORIGIN}/articles/","name":"مكتبة مقالات قرآن ريلز"},"numberOfItems":${arts.length}}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"الرئيسية","item":"${ORIGIN}/"},{"@type":"ListItem","position":2,"name":"المكتبة","item":"${ORIGIN}/articles/"},{"@type":"ListItem","position":3,"name":${JSON.stringify(meta.name)},"item":"${loc}"}]}
</script>
${HEAD_EXTRA}
</head>
<body>
${HEADER}
<main class="container">
  <div class="crumb"><a href="/">الرئيسية</a> ← <a href="/articles/">المكتبة</a> ← ${meta.name}</div>
  <section class="lp-hero">
    <h1>${meta.name} — ${arts.length} مقالًا في «${C.name}»</h1>
    <p class="lead">${meta.desc}</p>
    <p class="art-meta">${arts.length} مقالًا · ${deepN} عميقًا · <time datetime="${PUB_ISO}">آخر تحديث: ٣٠ أكتوبر ٢٠٢٦</time></p>
    <div class="lp-cta"><a class="btn btn-em" href="/articles/">📚 المكتبة كاملة</a><a class="btn btn-soft" href="${C.tool.h}">${C.tool.t}</a></div>
  </section>
  <section class="lp-sec">
    <h2>مقالات هذا المحور</h2>
    <div class="rc-grid">
${cards}
    </div>
  </section>
  <section class="lp-sec">
    <h2>محاور العنقود: ${C.name}</h2>
    <div class="chips">
${siblings.map((g) => `      <a href="/articles/${g.slug}/">${g.name}</a>`).join("\n")}
    </div>
  </section>
</main>
${FOOTER}
</body>
</html>
`;
}

/* — التنفيذ — */
let n = 0;
SPECS.forEach((s, i) => {
  const dir = path.join(__dirname, "..", "public", "articles", s.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), articlePage(s, i));
  n++;
  if (n % 2500 === 0) console.log("  … " + n + " articles");
});
fs.mkdirSync(path.join(__dirname, "..", "public", "articles"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "..", "public", "articles", "index.html"), hubPage());
let g = 0;
for (const gslug of GROUPS.keys()) {
  const dir = path.join(__dirname, "..", "public", "articles", gslug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), groupHubPage(gslug));
  g++;
}
const slugs = SPECS.map((s) => s.slug);
if (new Set(slugs).size !== slugs.length) {
  console.error("DUPLICATE SLUGS!");
  process.exit(1);
}
console.log(`articles: ${n} written + hub + ${g} group hubs`);
{
  const grpOf = new Map();
  for (const [gs, arr] of byGroup) for (const a of arr) grpOf.set(a.slug, GROUPS.get(gs).name);
  const idx = SPECS.map((a) => [a.slug, a.title.replace(/\s*\|\s*قرآن ريلز\s*$/, ""), grpOf.get(a.slug) || clusters[a.cluster].name]);
  fs.writeFileSync(path.join(__dirname, "..", "public", "articles-index.json"), JSON.stringify(idx));
  console.log(`articles-index.json: ${idx.length} entries`);
}

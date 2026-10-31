/* build_posts_en.js — كمل#21: EN articles + EN hub (/en/articles/) */
const fs = require("fs");
const path = require("path");

const SITE = "https://quran-reels-tau.vercel.app";
const OUT = path.join(__dirname, "..", "public");
const SPECS = require("../posts/en.js");
/* كمل#22: resolve {t} placeholders before render (html + JSON-LD) */
for (const s of SPECS) {
  const T = s.short || "Quran Reels";
  const r = (x) => String(x).replace(/\{t\}/g, T);
  if (s.desc) s.desc = r(s.desc);
  if (s.lead) s.lead = r(s.lead);
  if (s.apply) s.apply = r(s.apply);
  if (s.points) s.points = s.points.map(r);
  if (s.sections) s.sections = s.sections.map(sc => ({ h: r(sc.h), p: sc.p.map(r) }));
  if (s.faq) s.faq = s.faq.map(([q, a]) => [r(q), r(a)]);
}
const GENERATED = "<!-- generated -->";
const HEAD_EXTRA = `<script defer src="/_vercel/insights/script.js" data-sdkn="@vercel/analytics" data-sdkv="1.5.0"></script>
<script defer src="/_vercel/speed-insights/script.js"></script>
<script src="https://quge5.com/88/tag.min.js" data-zone="303174" async data-cfasync="false"></script>`;

function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function faqJsonLd(faq){return JSON.stringify({"@context":"https://schema.org","@type":"FAQPage","mainEntity":faq.map(([q,a])=>({"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}}))}).replace(/</g,"\\u003c");}
function articleJsonLd(s){
  const words = (s.lead + " " + s.desc + " " + s.points.join(" ") + " " + s.sections.map(x=>x.p.join(" ")).join(" ") + " " + s.faq.map(x=>x.join(" ")).join(" ")).split(/\s+/).length;
  const minutes = Math.max(2, Math.round(words/180));
  return JSON.stringify({"@context":"https://schema.org","@graph":[
    {"@type":"Article","headline":s.title,"description":s.desc,"image":[`${SITE}/img/articles/${s.slug}.jpg`],"datePublished":"2026-10-30","dateModified":"2026-10-30","keywords":s.kw,"timeRequired":`PT${minutes}M`,"isPartOf":{"@type":"CollectionPage","@id":`${SITE}/en/articles/`,"name":"Quran Reels Library (EN)"},"author":{"@type":"Organization","name":"قرآن ريلز"},"publisher":{"@type":"Organization","name":"قرآن ريلز","logo":{"@type":"ImageObject","url":`${SITE}/img/icon-192.png`}},"mainEntityOfPage":{"@type":"WebPage","@id":`${SITE}/en/articles/${s.slug}/`}},
    {"@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"Home","item":`${SITE}/en/`},
      {"@type":"ListItem","position":2,"name":"Library","item":`${SITE}/en/articles/`},
      {"@type":"ListItem","position":3,"name":s.short,"item":`${SITE}/en/articles/${s.slug}/`}]},
    ...faqJsonLd(s.faq)
  ]}).replace(/</g,"\\u003c");
}
function ogImg(s){
  return fs.existsSync(path.join(OUT,"img","articles",`${s.slug}.jpg`))
    ? `/img/articles/${s.slug}.jpg` : "/img/og-cover.jpg";
}

function articlePage(s){
  const url = `${SITE}/en/articles/${s.slug}/`;
  const twin = `${SITE}/articles/${s.arTwin}/`;
  const head = `<title>${esc(s.title)}</title>
<meta name="description" content="${esc(s.desc)}">
<meta name="keywords" content="${esc(s.kw)}">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="ar" href="${twin}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(s.title)}">
<meta property="og:description" content="${esc(s.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="Quran Reels">
<meta property="og:image" content="${SITE}${ogImg(s)}">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(s.title)}">
<meta name="twitter:description" content="${esc(s.desc)}">
<meta name="twitter:image" content="${SITE}${ogImg(s)}">
<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">
<meta name="theme-color" content="#0b1622">
<link rel="icon" href="/img/icon-192.png">
<link rel="apple-touch-icon" href="/img/icon-192.png">
<meta property="article:published_time" content="2026-10-30T00:00:00+02:00">
<meta property="article:section" content="Quran guides">
<meta property="article:tag" content="${esc(s.kw)}">
<link rel="alternate" hreflang="en" href="${url}">
<link rel="alternate" hreflang="x-default" href="${SITE}/articles/${s.arTwin}/">
<link rel="stylesheet" href="/css/style.css">
<link rel="preload" href="/css/style.css" as="style">
<link rel="dns-prefetch" href="https://everyayah.com">
<script type="application/ld+json">${articleJsonLd(s)}</script>
${HEAD_EXTRA}`;

  const FOOT = `${GENERATED}<footer class="foot" role="contentinfo">
  <div class="foot-grid">
    <nav aria-label="Footer">
      <strong>Quran Reels</strong>
      <a href="/en/">Home</a>
      <a href="/en/quran-video-maker/">Quran Video Maker</a>
      <a href="/en/articles/">Library</a>
      <a href="/en/tools/">Tools</a>
      <a href="/en/prayer-times/">Prayer Times</a>
      <a href="/en/qibla-direction/">Qibla Direction</a>
    </nav>
    <div class="foot-note">
      <p>Built with Quranic text from the Uthmani mushaf · Recitations by known reciters · Free to use</p>
      <p><a href="/articles/">المكتبة العربية</a> · <a href="/">العربية</a> · © 2026 Quran Reels</p>
    </div>
  </div>
</footer>`;

  const points = s.points.map(p=>`<li>${esc(p)}</li>`).join("\n");
  const sections = s.sections.map(sc=>`<section><h2>${esc(sc.h)}</h2>${sc.p.map(p=>`<p>${esc(p)}</p>`).join("")}</section>`).join("\n");
  const faq = s.faq.map(([q,a])=>`<details class="faq-item"><summary><span>${esc(q)}</span></summary><div class="faq-a"><p>${esc(a)}</p></div></details>`).join("\n");
  const links = s.links.map(([h,t])=>`<li><a href="${esc(h)}" rel="internal">${esc(t)}</a></li>`).join("\n");
  const related = SPECS.filter(x=>x.slug!==s.slug).slice(0,3)
    .map(x=>`<li><a href="/en/articles/${x.slug}/">${esc(x.short)}</a></li>`).join("\n");

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
${head}
</head>
<body>
${GENERATED}<a class="skip" href="#main">Skip to content</a>
<header class="topbar" role="banner">
  <a class="brand" href="/en/"><img src="/img/icon-192.png" width="110" height="110" alt="Quran Reels logo" decoding="async"></a>
  <nav class="langnav" aria-label="Language"><a href="/">العربية</a> <a class="on" href="/en/" aria-current="page">EN</a></nav>
</header>
<nav class="crumb" aria-label="Breadcrumb">
  <a href="/en/">Home</a> <span aria-hidden="true">/</span>
  <a href="/en/articles/">Library</a> <span aria-hidden="true">/</span>
  <span aria-current="page">${esc(s.short)}</span>
</nav>
<main id="main" class="article">
  <article>
    <h1>${esc(s.title)}</h1>
    <p class="article-lead">${esc(s.lead)}</p>
    <img src="${ogImg(s)}" alt="${esc(s.short)}" width="1080" height="720" loading="lazy" decoding="async">
    <ul class="kv-list">
${points}
    </ul>
${sections}
    <section><h2>Start today</h2><p>${esc(s.apply)}</p></section>
    <section><h2>Links from this guide</h2><ul>${links}</ul></section>
    <section class="article-faq" aria-label="FAQ">
      <h2>FAQ</h2>
${faq}
    </section>
    <section class="article-related" aria-label="Related">
      <h2>Continue in English</h2>
      <ul>${related}</ul>
    </section>
    <p class="article-share"><a class="cta" href="/en/quran-video-maker/">Open the Quran Video Maker →</a></p>
  </article>
</main>
${FOOT}
</body>
</html>
`;
}

function hubPage(){
  const url = `${SITE}/en/articles/`;
  const ld = JSON.stringify({"@context":"https://schema.org","@graph":[
    {"@type":"CollectionPage","@id":url,"url":url,"name":"Quran Reels Library — Guides in English","description":`${SPECS.length} practical English guides: Quran video making, reciters, prayer times, adhkar and publishing.`,"inLanguage":"en","isPartOf":{"@type":"WebSite","@id":`${SITE}/`},"hasPart":SPECS.map(s=>({"@type":"CreativeWork","@id":`${SITE}/en/articles/${s.slug}/`}))},
    {"@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"Home","item":`${SITE}/en/`},
      {"@type":"ListItem","position":2,"name":"Library","item":url}]}
  ]}).replace(/</g,"\\u003c");
  const head = `<title>Quran Reels Library — ${SPECS.length} Guides in English</title>
<meta name="description" content="Practical English guides on Quran videos, recitation, prayer times and publishing: ${SPECS.length} complete guides from Quran Reels.">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="ar" href="${SITE}/articles/">
<link rel="alternate" hreflang="en" href="${url}">
<link rel="alternate" hreflang="x-default" href="${SITE}/articles/">
<meta property="og:type" content="website">
<meta property="og:title" content="Quran Reels Library — Guides in English">
<meta property="og:description" content="${SPECS.length} practical English guides on Quran videos, recitation and publishing.">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="Quran Reels">
<meta property="og:image" content="${SITE}/img/og-cover.jpg">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">
<meta name="theme-color" content="#0b1622">
<link rel="icon" href="/img/icon-192.png">
<link rel="apple-touch-icon" href="/img/icon-192.png">
<link rel="stylesheet" href="/css/style.css">
<link rel="preload" href="/css/style.css" as="style">
<script type="application/ld+json">${ld}</script>
${HEAD_EXTRA}`;
  const cards = SPECS.map((s,i)=>`<li class="hub-card"><a href="/en/articles/${s.slug}/" title="${esc(s.title)}"><img src="${ogImg(s)}" alt="${esc(s.short)}" width="640" height="360" loading="lazy" decoding="async"><div class="hub-body"><span class="hub-tag">Guide ${i+1}</span><h3>${esc(s.short)}</h3><p>${esc(s.desc.slice(0,140))}…</p></div></a></li>`).join("\n");
  const FOOT = `${GENERATED}<footer class="foot" role="contentinfo">
  <div class="foot-grid">
    <nav aria-label="Footer">
      <strong>Quran Reels</strong>
      <a href="/en/">Home</a>
      <a href="/en/quran-video-maker/">Quran Video Maker</a>
      <a href="/en/articles/">Library</a>
      <a href="/en/tools/">Tools</a>
      <a href="/en/prayer-times/">Prayer Times</a>
      <a href="/en/qibla-direction/">Qibla Direction</a>
    </nav>
    <div class="foot-note">
      <p>Built with Quranic text from the Uthmani mushaf · Recitations by known reciters · Free to use</p>
      <p><a href="/articles/">المكتبة العربية</a> · <a href="/">العربية</a> · © 2026 Quran Reels</p>
    </div>
  </div>
</footer>`;
  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
${head}
</head>
<body>
${GENERATED}<a class="skip" href="#main">Skip to content</a>
<header class="topbar" role="banner">
  <a class="brand" href="/en/"><img src="/img/icon-192.png" width="110" height="110" alt="Quran Reels logo" decoding="async"></a>
  <nav class="langnav" aria-label="Language"><a href="/">العربية</a> <a class="on" href="/en/" aria-current="page">EN</a></nav>
</header>
<nav class="crumb" aria-label="Breadcrumb">
  <a href="/en/">Home</a> <span aria-hidden="true">/</span>
  <span aria-current="page">Library</span>
</nav>
<main id="main" class="hub">
  <section class="hub-hero" aria-labelledby="hub-h">
    <h1 id="hub-h">Quran Reels Library — ${SPECS.length} Guides in English</h1>
    <p class="hub-sub">Practical, complete guides: Quran video production, recitation, prayer times and publishing. The full Arabic library (${400} articles) lives at <a href="/articles/">/articles/</a>.</p>
    <p class="hub-sub"><strong>${SPECS.length} guides</strong> · Updated 28 October 2026</p>
  </section>
  <h2 class="hub-grid-title">All ${SPECS.length} guides</h2>
  <ul class="hub-grid">
${cards}
  </ul>
</main>
${FOOT}
</body>
</html>
`;
}

function main(){
  const dir = path.join(OUT,"en","articles");
  fs.mkdirSync(dir,{recursive:true});
  for(const s of SPECS){
    const d = path.join(dir,s.slug);
    fs.mkdirSync(d,{recursive:true});
    fs.writeFileSync(path.join(d,"index.html"),articlePage(s),"utf8");
  }
  fs.writeFileSync(path.join(dir,"index.html"),hubPage(),"utf8");
  console.log(`en: ${SPECS.length} articles + hub -> /en/articles/`);
}
main();

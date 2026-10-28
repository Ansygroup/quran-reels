/* ============================================================
 * build_posts.js — محرّك مقالات «المكتبة» /articles/ (كمل#20)
 * يقرأ: posts/index.js (مواضيع فريدة) + posts/library.js (بنوك المحتوى)
 * يكتب: public/articles/<slug>/index.html × N + public/articles/index.html
 * داخل المقال: مقدمة فريدة + نقاط فريدة + قسمان من بنوك العناقيد +
 * تطبيق فريد + خطوات + FAQ (FAQPage LD) + ترابط تلقائي (ذات صلة + أداة).
 * الصور: إن وُجد public/img/articles/<slug>.jpg يُستخدم hero+og، وإلا بانر CSS.
 * ============================================================ */
const fs = require("fs");
const path = require("path");
const { clusters } = require("../posts/library.js");
const SPECS = require("../posts/index.js");

const ORIGIN = "https://quran-reels-tau.vercel.app";
const VERIF = "IHmoe5QFrC77PbZdh2O0MeZFLIKwg-saA50td32AcQo";
const ICON = "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2064%2064'%3E%3Crect%20width='64'%20height='64'%20rx='16'%20fill='%23050f0c'/%3E%3Cpath%20d='M44%2014a20%2020%200%201%200%206%2026A16%2016%200%201%201%2044%2014z'%20fill='%23e6c46a'/%3E%3Ccircle%20cx='46'%20cy='22'%20r='3'%20fill='%23e6c46a'/%3E%3C/svg%3E";
const PUB = "2026-10-28";
const PUB_ISO = "2026-10-28T09:00:00+02:00";

const STYLE = `
  .lp-hero{padding:52px 6% 26px;text-align:center;background:radial-gradient(700px 250px at 50% -50px, rgba(212,175,55,.13), transparent 72%),linear-gradient(180deg, rgba(255,255,255,.035), transparent 75%);border-bottom:1px solid var(--line)}
  .lp-hero h1{font-size:clamp(1.6rem,4.2vw,2.4rem);font-weight:900;margin-bottom:12px}
  .lp-hero p.lead{max-width:760px;margin:0 auto 18px;color:var(--muted);font-size:1.03rem;line-height:1.95}
  .lp-cta{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px}
  .art-meta{max-width:760px;margin:0 auto;text-align:center;font-size:.85rem;color:var(--muted)}
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
  :focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  ::selection{background:rgba(212,175,55,.35);color:#fff}
  @media (prefers-reduced-motion:reduce){.feat div,.lp-links a,.rc-card{transition:none;transform:none}}
`;

const FOOT = `<span>© 2026 قرآن ريلز — <a href="/" style="color:var(--gold-3)">الصفحة الرئيسية</a> · <a href="/ar/quran-video-maker/" style="color:var(--gold-3)">صانع الفيديو</a> · <a href="/ar/reciters/" style="color:var(--gold-3)">القرّاء</a> · <a href="/articles/" style="color:var(--gold-3)">المكتبة</a> · <a href="/blog/" style="color:var(--gold-3)">المدونة</a> · <a href="/ar/islamic-tools/" style="color:var(--gold-3)">الأدوات</a> · <a href="/about/" style="color:var(--gold-3)">عنّا</a> · <a href="/contact/" style="color:var(--gold-3)">تواصل</a> · <a href="/privacy/" style="color:var(--gold-3)">خصوصية</a></span>`;

const HEAD_EXTRA = `<meta property="og:site_name" content="قرآن ريلز">
<meta property="og:locale" content="ar_AR">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#050f0c">
<link rel="icon" href="${ICON}">
<link rel="apple-touch-icon" href="/img/icon-192.png?v=2">
<link rel="stylesheet" href="/css/style.css?v=3">
<style>${STYLE}</style>
<script defer src="/_vercel/insights/script.js"></script>`;

const HEADER = `<div class="topbar">☽ صدقة جارية على نبيّنا محمد ﷺ · الموقع مجاني 100%</div>
<header class="site-header">
  <div class="container header-in">
    <a class="brand" href="/">
      <span class="brand-logo"><svg viewBox="0 0 64 64" fill="none"><path d="M46 10a22 22 0 1 0 7 30A17.5 17.5 0 1 1 46 10z" fill="#1d1403"/><circle cx="49" cy="19" r="3.4" fill="#1d1403"/></svg></span>
      <span>قرآن ريلز<small>مكتبة المقالات</small></span>
    </a>
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

/* — تجميع جسم المقال لمواصفة — */
function bodyFor(spec, idx) {
  const C = clusters[spec.cluster];
  if (!C) throw new Error("no cluster: " + spec.cluster);
  const n = C.sections.length;
  const s1 = C.sections[idx % n];
  const s2 = C.sections[(idx + 3) % n];
  const hero = fs.existsSync(path.join(__dirname, "..", "public", "img", "articles", spec.slug + ".jpg"));

  const related = (() => {
    const same = SPECS.filter((x) => x.cluster === spec.cluster && x.slug !== spec.slug);
    const i = same.findIndex((x) => x.slug === spec.slug);
    const pick = [same[(idx + 1) % same.length], same[(idx + 5) % same.length], same[(idx + 9) % same.length]]
      .filter(Boolean)
      .filter((x, k, arr) => arr.findIndex((y) => y.slug === x.slug) === k)
      .slice(0, 3);
    return pick;
  })();

  const apply = spec.apply.replace(/\{t\}/g, spec.short || spec.h1);
  const hookLead = spec.lead.replace(/\{t\}/g, spec.short || spec.h1);

  return `
${hero ? `<img class="hero-img" src="/img/articles/${spec.slug}.jpg" alt="${(spec.h1 || spec.title).replace(/"/g, "")}" width="1536" height="1024" loading="lazy" decoding="async">` : ""}
  <section class="lp-sec">
    <h2>${spec.hookTitle || "لماذا يهمّ هذا الموضوع؟"}</h2>
    <p>${hookLead}</p>
    <p>${C.intro.replace(/\{t\}/g, spec.short || spec.h1)}</p>
    <ul>
${spec.points.map((p) => `      <li>${p}</li>`).join("\n")}
    </ul>
  </section>
  <section class="lp-sec">
    <h2>${s1.h.replace(/\{t\}/g, spec.short || spec.h1)}</h2>
${s1.p.map((x) => `    <p>${x.replace(/\{t\}/g, spec.short || spec.h1)}</p>`).join("\n")}
  </section>
  <section class="lp-sec">
    <h2>${s2.h.replace(/\{t\}/g, spec.short || spec.h1)}</h2>
${s2.p.map((x) => `    <p>${x.replace(/\{t\}/g, spec.short || spec.h1)}</p>`).join("\n")}
  </section>
  <section class="lp-sec">
    <h2>كيف تطبّقها على «${spec.short || spec.h1}»؟</h2>
    <p>${apply}</p>
    <div class="callout"><b>تطبيق عملي فوري:</b> ${C.toolLine.replace(/\{t\}/g, spec.short || spec.h1)} — <a href="${C.tool.h}" style="color:var(--gold-3)">${C.tool.t}</a>.</div>
    <h3>خطوات مرقّمة</h3>
    <ol>
${C.steps.map((x) => `      <li>${x.replace(/\{t\}/g, spec.short || spec.h1)}</li>`).join("\n")}
    </ol>
  </section>
  <section class="lp-sec">
    <h2>اقرأ أيضًا (روابط داخلية مختارة)</h2>
    <ul>
${spec.links.map(([h, t]) => `      <li><a href="${h}">${t}</a></li>`).join("\n")}
      <li><a href="/articles/">مكتبة المقالات كاملة</a> — وكل مقال في العناقيد يربط جارَه في النهاية.</li>
    </ul>
  </section>
  <section class="lp-sec">
    <h2>مقالات ذات صلة</h2>
    <div class="rc-grid">
${related.map((r) => `      <a class="rc-card" href="/articles/${r.slug}/"><b>${r.short || r.title}</b><i>${r.desc.slice(0, 90)}…</i></a>`).join("\n")}
    </div>
  </section>`;
}

function articlePage(spec, idx) {
  const loc = ORIGIN + "/articles/" + spec.slug + "/";
  const C = clusters[spec.cluster];
  const heroFile = "img/articles/" + spec.slug + ".jpg";
  const hasHero = fs.existsSync(path.join(__dirname, "..", "public", heroFile));
  const ogImg = hasHero ? ORIGIN + "/" + heroFile : ORIGIN + "/img/og-cover.jpg?v=2";
  const body = bodyFor(spec, idx);
  const read = Math.max(3, Math.round(wordsOf(body + spec.desc) / 180));
  const faq = [...spec.faq, [C.faqQ.replace(/\{t\}/g, spec.short || spec.h1), C.faqA.replace(/\{t\}/g, spec.short || spec.h1)]];
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
<style>${STYLE}</style>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Article","headline":${JSON.stringify(spec.title)},"description":${JSON.stringify(spec.desc)},"datePublished":"${PUB_ISO}","dateModified":"${PUB_ISO}","inLanguage":"ar","mainEntityOfPage":{"@type":"WebPage","@id":"${loc}"},"image":"${ogImg}","author":{"@type":"Organization","name":"قرآن ريلز","url":"${ORIGIN}/"},"publisher":{"@type":"Organization","name":"قرآن ريلز","url":"${ORIGIN}/","logo":{"@type":"ImageObject","url":"${ORIGIN}/img/og-cover.jpg?v=2"}}}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"الرئيسية","item":"${ORIGIN}/"},{"@type":"ListItem","position":2,"name":"المكتبة","item":"${ORIGIN}/articles/"},{"@type":"ListItem","position":3,"name":${JSON.stringify(spec.title)},"item":"${loc}"}]}
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
  <div class="crumb"><a href="/">الرئيسية</a> ← <a href="/articles/">المكتبة</a> ← ${spec.h1 || spec.short}</div>
  <section class="lp-hero">
    <h1>${spec.h1 || spec.title}</h1>
    <p class="lead">${spec.lead.replace(/\{t\}/g, spec.short || spec.h1)}</p>
    <p class="art-meta">بقلم <b>قرآن ريلز</b> · <time datetime="${PUB_ISO}">٢٨ أكتوبر ٢٠٢٦</time> · ${read} دقائق قراءة · عناقيد: ${C.name}</p>
    <div class="lp-cta"><a class="btn btn-em" href="${C.tool.h}">${C.tool.t}</a><a class="btn btn-soft" href="/articles/">📚 المكتبة</a></div>
  </section>
${body}
  <section class="lp-sec">
    <h2>الأسئلة الشائعة</h2>
    ${faq.map(([q, x]) => `<div class="qa"><h3>${q}</h3><p>${x}</p></div>`).join("\n    ")}
  </section>
  <div class="lp-links">
    <a href="/articles/">📚 كل المقالات</a>
${C.clusterLinks.map(([h, t]) => `    <a href="${h}">${t}</a>`).join("\n")}
  </div>
</main>
${FOOTER}
</body>
</html>
`;
}

function hubPage() {
  const loc = ORIGIN + "/articles/";
  const cards = SPECS.map((s) => `    <a class="rc-card" href="/articles/${s.slug}/"><b>${s.short || s.title}</b><i>${s.desc.slice(0, 110)}…</i></a>`).join("\n");
  const byCluster = uniq(SPECS.map((s) => s.cluster));
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>مكتبة مقالات قرآن ريلز — ${SPECS.length} دليلًا عمليًا بالصور والروابط | قرآن ريلز</title>
<meta name="description" content="مكتبة المقالات: ${SPECS.length} دليلًا عمليًا في صناعة المقاطع القرآنية والحفظ والأذكار والصلاة والمواسم والنشر — بروابط داخلية وصور و FAQs.">
<meta name="keywords" content="مقالات قرآن, مكتبة مقالات, ادلة عملية, مقالات صناعة الفيديو">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${loc}">
<meta name="google-site-verification" content="${VERIF}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="قرآن ريلز">
<meta property="og:locale" content="ar_AR">
<meta property="og:title" content="مكتبة مقالات قرآن ريلز — ${SPECS.length} دليلًا عمليًا">
<meta property="og:description" content="${SPECS.length} دليلًا عمليًا بالصور والروابط الداخلية في المقاطع القرآنية والحفظ والأذكار والمواسم.">
<meta property="og:url" content="${loc}">
<meta property="og:image" content="${ORIGIN}/img/og-cover.jpg?v=2">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#050f0c">
<link rel="icon" href="${ICON}">
<link rel="apple-touch-icon" href="/img/icon-192.png?v=2">
<link rel="stylesheet" href="/css/style.css?v=3">
<style>${STYLE}</style>
<script defer src="/_vercel/insights/script.js"></script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"CollectionPage","name":"مكتبة مقالات قرآن ريلز","url":"${loc}","inLanguage":"ar","isPartOf":{"@type":"WebSite","name":"قرآن ريلز","url":"${ORIGIN}/"},"hasPart":[
${SPECS.map((s) => `{"@type":"Article","headline":${JSON.stringify(s.title)},"url":"${ORIGIN}/articles/${s.slug}/","datePublished":"${PUB_ISO}","author":{"@type":"Organization","name":"قرآن ريلز"}}`).join(",\n")}
]}
</script>
</head>
<body>
${HEADER}
<main class="container">
  <div class="crumb"><a href="/">الرئيسية</a> ← المكتبة</div>
  <section class="lp-hero">
    <h1>مكتبة المقالات — ${SPECS.length} دليلًا عمليًّا</h1>
    <p class="lead">محتوى مُهيّأ للبحث والاقتباس: مقالات مبنية على أنظمة عناقيد (فيديو · قرّاء · صلاة · حفظ · أذكار · مواسم · أسرة · نشر) — كل مقال بأسئلة شائعة وروابط داخلية وصورة عند توفرها.</p>
    <p class="art-meta">آخر تحديث: <time datetime="${PUB_ISO}">٢٨ أكتوبر ٢٠٢٦</time> · ${SPECS.length} مقالًا · ${byCluster.length} عناقيد</p>
    <div class="lp-cta"><a class="btn btn-em" href="/blog/">📚 المدونة</a><a class="btn btn-soft" href="/ar/quran-video-maker/">🎬 الصانع</a></div>
  </section>
  <section class="lp-sec">
    <h2>كل المقالات</h2>
    <div class="rc-grid">
${cards}
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
});
fs.mkdirSync(path.join(__dirname, "..", "public", "articles"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "..", "public", "articles", "index.html"), hubPage());
console.log(`articles: ${n} written + hub`);
const slugs = SPECS.map((s) => s.slug);
if (new Set(slugs).size !== slugs.length) {
  console.error("DUPLICATE SLUGS!");
  process.exit(1);
}

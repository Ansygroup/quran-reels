/* كمل#13 — المدونة والموسمية: /blog/ (فهرس) + 8 مقالات على كلمات المنافسين الحقيقية.
 * الاستخدام: node scripts/build_blog.js   → public/blog/<slug>/index.html */
const fs = require("fs");
const path = require("path");

const ORIGIN = "https://quran-reels-tau.vercel.app";
const VERIF = "IHmoe5QFrC77PbZdh2O0MeZFLIKwg-saA50td32AcQo";
const ICON = "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2064%2064'%3E%3Crect%20width='64'%20height='64'%20rx='16'%20fill='%23050f0c'/%3E%3Cpath%20d='M44%2014a20%2020%200%201%200%206%2026A16%2016%200%201%201%2044%2014z'%20fill='%23e6c46a'/%3E%3Ccircle%20cx='46'%20cy='22'%20r='3'%20fill='%23e6c46a'/%3E%3C/svg%3E";
const PUB = "2026-10-27";

const STYLE = `
  .lp-hero{padding:54px 0 26px;text-align:center}
  .lp-hero h1{font-size:clamp(1.7rem,4.4vw,2.5rem);font-weight:900;margin-bottom:12px}
  .lp-hero p.lead{max-width:760px;margin:0 auto 20px;color:var(--muted);font-size:1.03rem;line-height:1.95}
  .lp-cta{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px}
  .art-meta{max-width:760px;margin:0 auto;text-align:center;font-size:.85rem;color:var(--muted)}
  .lp-sec{max-width:840px;margin:26px auto}
  .lp-sec h2{font-size:1.3rem;font-weight:800;margin:26px 0 10px;color:var(--gold-3)}
  .lp-sec h3{font-size:1.05rem;font-weight:700;margin:18px 0 8px;color:var(--gold-3)}
  .lp-sec p,.lp-sec li{line-height:2.05;color:var(--muted);font-size:.97rem}
  .lp-sec ul,.lp-sec ol{padding-right:22px}
  .feat{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin:18px 0}
  .feat div{background:var(--panel);border:1px solid var(--line-2);border-radius:14px;padding:14px 16px;font-size:.92rem;color:var(--muted);line-height:1.85}
  .feat b{color:var(--gold-3);display:block;margin-bottom:4px;font-size:.98rem}
  .qa{background:var(--panel);border:1px solid var(--line-2);border-radius:14px;padding:2px 20px 8px;margin:10px 0}
  .qa h3{font-size:1.02rem;font-weight:800;color:var(--gold-3);margin:14px 0 6px}
  .qa p{color:var(--muted);line-height:1.95;font-size:.94rem;margin:0 0 10px}
  .lp-links{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:26px}
  .lp-links a{border:1px solid var(--line-2);border-radius:99px;padding:7px 16px;font-size:.86rem;color:var(--gold-3);text-decoration:none}
  .lp-links a:hover{background:rgba(212,175,55,.1)}
  .tbl{width:100%;border-collapse:collapse;margin:16px 0;font-size:.9rem}
  .tbl th,.tbl td{border:1px solid var(--line-2);padding:9px 12px;text-align:right;color:var(--muted)}
  .tbl th{background:rgba(212,175,55,.08);color:var(--gold-3);font-weight:800}
  .tbl td b{color:#86efac}
  .crumb{font-size:.86rem;color:var(--muted);margin:16px 0 -4px}
  .crumb a{color:var(--gold-3);text-decoration:none}
  .rc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px;margin:16px 0}
  .rc-card{display:block;background:var(--panel);border:1px solid var(--line-2);border-radius:12px;padding:13px 15px;color:var(--muted);text-decoration:none;font-size:.9rem;line-height:1.7}
  .rc-card:hover{border-color:var(--gold-3)}
  .rc-card b{display:block;color:var(--gold-3);font-size:.98rem;margin-bottom:3px}
  .rc-card i{font-style:normal;font-size:.78rem;opacity:.8;display:block;margin-top:4px}
  .callout{background:rgba(212,175,55,.06);border:1px solid var(--gold-3);border-radius:14px;padding:12px 18px;margin:16px 0;color:var(--muted);font-size:.95rem;line-height:1.95}
  .callout b{color:var(--gold-3)}
`;

const FOOT = `<span>© 2026 قرآن ريلز — <a href="/" style="color:var(--gold-3)">الصفحة الرئيسية</a> · <a href="/ar/quran-video-maker/" style="color:var(--gold-3)">صانع الفيديو</a> · <a href="/ar/reciters/" style="color:var(--gold-3)">القرّاء</a> · <a href="/blog/" style="color:var(--gold-3)">مقالات</a> · <a href="/ar/islamic-tools/" style="color:var(--gold-3)">الأدوات</a> · <a href="/about/" style="color:var(--gold-3)">عنّا</a> · <a href="/contact/" style="color:var(--gold-3)">تواصل</a> · <a href="/terms/" style="color:var(--gold-3)">شروط</a> · <a href="/privacy/" style="color:var(--gold-3)">خصوصية</a></span>`;

function articlePage(a) {
  const loc = ORIGIN + "/blog/" + a.slug + "/";
  const extraLd = a.extraLd || "";
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${a.title}</title>
<meta name="description" content="${a.desc}">
<meta name="keywords" content="${a.keywords}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${loc}">
<meta name="google-site-verification" content="${VERIF}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="قرآن ريلز">
<meta property="og:locale" content="ar_AR">
<meta property="og:title" content="${a.title}">
<meta property="og:description" content="${a.desc}">
<meta property="og:url" content="${loc}">
<meta property="og:image" content="${ORIGIN}/img/og-cover.jpg?v=2">
<meta property="article:published_time" content="${PUB}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${a.title}">
<meta name="twitter:description" content="${a.desc}">
<meta name="twitter:image" content="${ORIGIN}/img/og-cover.jpg?v=2">
<meta name="theme-color" content="#050f0c">
<link rel="icon" href="${ICON}">
<link rel="apple-touch-icon" href="/img/icon-192.png?v=2">
<link rel="stylesheet" href="/css/style.css?v=3">
<style>${STYLE}</style>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Article","headline":${JSON.stringify(a.title)},"description":${JSON.stringify(a.desc)},"datePublished":"${PUB}","dateModified":"${PUB}","inLanguage":"ar","mainEntityOfPage":{"@type":"WebPage","@id":"${loc}"},"image":"${ORIGIN}/img/og-cover.jpg?v=2","author":{"@type":"Organization","name":"قرآن ريلز","url":"${ORIGIN}/"},"publisher":{"@type":"Organization","name":"قرآن ريلز","url":"${ORIGIN}/","logo":{"@type":"ImageObject","url":"${ORIGIN}/img/og-cover.jpg?v=2"}}}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"الرئيسية","item":"${ORIGIN}/"},{"@type":"ListItem","position":2,"name":"المدونة","item":"${ORIGIN}/blog/"},{"@type":"ListItem","position":3,"name":${JSON.stringify(a.title)},"item":"${loc}"}]}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
${a.faq.map(([q, x]) => `{"@type":"Question","name":${JSON.stringify(q)},"acceptedAnswer":{"@type":"Answer","text":${JSON.stringify(x)}}}`).join(",\n")}
]}
</script>${extraLd}
</head>
<body>
<div class="topbar">☽ صدقة جارية على نبيّنا محمد ﷺ · الموقع مجاني 100%</div>
<header class="site-header">
  <div class="container header-in">
    <a class="brand" href="/">
      <span class="brand-logo"><svg viewBox="0 0 64 64" fill="none"><path d="M46 10a22 22 0 1 0 7 30A17.5 17.5 0 1 1 46 10z" fill="#1d1403"/><circle cx="49" cy="19" r="3.4" fill="#1d1403"/></svg></span>
      <span>قرآن ريلز<small>صانع فيديو قرآن مجاني</small></span>
    </a>
    <a class="btn btn-em" href="/#/">🎬 ابدأ الآن</a>
  </div>
</header>
<main class="container">
  <div class="crumb"><a href="/">الرئيسية</a> ← <a href="/blog/">المدونة</a> ← ${a.h1short || a.h1}</div>
  <section class="lp-hero">
    <h1>${a.h1}</h1>
    <p class="lead">${a.lead}</p>
    <p class="art-meta">بقلم <b>قرآن ريلز</b> · <time datetime="${PUB}">٢٧ أكتوبر ٢٠٢٦</time>${a.read ? ` · ${a.read} دقائق قراءة` : ""}</p>
    <div class="lp-cta">${a.cta.map(c => `<a class="btn btn-em" href="${c.h}">${c.t}</a>`).join("")}</div>
  </section>
${a.body}
  <section class="lp-sec">
    <h2>الأسئلة الشائعة</h2>
    ${a.faq.map(([q, x]) => `<div class="qa"><h3>${q}</h3><p>${x}</p></div>`).join("\n    ")}
  </section>
  <div class="lp-links">
    <a href="/blog/">📚 كل المقالات</a>
    ${a.links.map(([h, t]) => `<a href="${h}">${t}</a>`).join("\n    ")}
  </div>
</main>
<footer class="footer" style="margin-top:30px">
  <div class="container foot-bottom">
    ${FOOT}
    <span>﴿ إِنَّ اللَّهَ مَعَ الصَّابِرِينَ ﴾</span>
  </div>
</footer>
</body>
</html>
`;
}

function hubPage(articles) {
  const loc = ORIGIN + "/blog/";
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>مدونة قرآن ريلز — أدلة صناعة المقاطع القرآنية والنشر | قرآن ريلز</title>
<meta name="description" content="مقالات عملية: أفكار ريلز جاهزة، مقارنة أدوات فيديو القرآن، خطة رمضان1448، محتوى الجمعة، دليل المبتدئين والأتمتة — من فريق قرآن ريلز.">
<meta name="keywords" content="مدونة قرآن, أفكار ريلز قرآن, دليل فيديو قرآن, مقارنة أدوات قرآن">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${loc}">
<meta name="google-site-verification" content="${VERIF}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="قرآن ريلز">
<meta property="og:locale" content="ar_AR">
<meta property="og:title" content="مدونة قرآن ريلز — أدلة صناعة المقاطع القرآنية">
<meta property="og:description" content="أفكار ومقارنات وخطط محتوى للمقاطع القرآنية — مقالات عملية تُنشر أسبوعيًا.">
<meta property="og:url" content="${loc}">
<meta property="og:image" content="${ORIGIN}/img/og-cover.jpg?v=2">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="مدونة قرآن ريلز">
<meta name="twitter:description" content="أفكار ومقارنات وخطط محتوى للمقاطع القرآنية.">
<meta name="twitter:image" content="${ORIGIN}/img/og-cover.jpg?v=2">
<meta name="theme-color" content="#050f0c">
<link rel="icon" href="${ICON}">
<link rel="apple-touch-icon" href="/img/icon-192.png?v=2">
<link rel="stylesheet" href="/css/style.css?v=3">
<style>${STYLE}</style>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"CollectionPage","name":"مدونة قرآن ريلز","url":"${loc}","inLanguage":"ar","isPartOf":{"@type":"WebSite","name":"قرآن ريلز","url":"${ORIGIN}/"},"hasPart":[
${articles.map(a => `{"@type":"BlogPosting","headline":${JSON.stringify(a.title)},"url":"${ORIGIN}/blog/${a.slug}/","datePublished":"${PUB}","author":{"@type":"Organization","name":"قرآن ريلز"}}`).join(",\n")}
]}
</script>
</head>
<body>
<div class="topbar">☽ صدقة جارية على نبيّنا محمد ﷺ · الموقع مجاني 100%</div>
<header class="site-header">
  <div class="container header-in">
    <a class="brand" href="/">
      <span class="brand-logo"><svg viewBox="0 0 64 64" fill="none"><path d="M46 10a22 22 0 1 0 7 30A17.5 17.5 0 1 1 46 10z" fill="#1d1403"/><circle cx="49" cy="19" r="3.4" fill="#1d1403"/></svg></span>
      <span>قرآن ريلز<small>صانع فيديو قرآن مجاني</small></span>
    </a>
    <a class="btn btn-em" href="/#/">🎬 ابدأ الآن</a>
  </div>
</header>
<main class="container">
  <div class="crumb"><a href="/">الرئيسية</a> ← المدونة</div>
  <section class="lp-hero">
    <h1>مدونة قرآن ريلز</h1>
    <p class="lead">أدلة عملية لصناعة المحتوى القرآني ونشره: أفكار جاهزة، مقارنات صريحة، خطط موسمية، وشروحات للمبتدئين — تُحدَّث تباعًا لاعتماد المولّد والمصادر نفسها التي نستخدمها.</p>
    <div class="lp-cta"><a class="btn btn-em" href="/#/">🎬 جرّب المولّد</a><a class="btn btn-em" href="/ar/quran-video-maker/">صانع الفيديو</a></div>
  </section>
  <div class="lp-sec">
    <div class="rc-grid">
${articles.map(a => `      <a class="rc-card" href="/blog/${a.slug}/"><b>${a.cardTitle}</b>${a.cardDesc}<i>٢٧ أكتوبر ٢٠٢٦</i></a>`).join("\n")}
    </div>
  </div>
  <section class="lp-sec">
    <h2>أدوات تكمّل المقالات</h2>
    <div class="feat">
      <div><b>مواضيع الآيات</b>اختر آية حسب الموضوع (تحفيز، حماية، رزق…) من <a href="/#/tool/topics" style="color:var(--gold-3)">أداة المواضيع</a>.</div>
      <div><b>الآية اليومية</b>افتح يومك بآية جاهزة للتغليف من <a href="/#/tool/ayah-day" style="color:var(--gold-3)">آية اليوم</a>.</div>
      <div><b>جدولة النشر</b>حوّل النشر اليومي إلى عادة مع <a href="/#/tool/prayer" style="color:var(--gold-3)">أدوات الموقع</a> وصفحة الحساب الاختيارية.</div>
    </div>
  </section>
</main>
<footer class="footer" style="margin-top:30px">
  <div class="container foot-bottom">
    ${FOOT}
    <span>﴿ إِنَّ اللَّهَ مَعَ الصَّابِرِينَ ﴾</span>
  </div>
</footer>
</body>
</html>
`;
}

/* ============================= المقالات الثمانية ============================= */
const ARTICLES = [
{
  slug: "quran-video-ideas",
  cardTitle: "٣٠ فكرة فيديو قرآن",
  cardDesc: "أفكار جاهزة لتيك توك وإنستغرام — بلا تكرار ولا استنساخ.",
  title: "30 فكرة فيديو قرآن لتيك توك وإنستغرام — محتوى جاهز بلا تكرار | مدونة قرآن ريلز",
  desc: "قائمة عملية بـ30 فكرة فيديو قرآن للمقاطع القصيرة: آيات تحفيز وأمان ودعاء وقصص قصيرة، مع روزنامة نشر أسبوعية ونصائح لتفادي التكرار.",
  keywords: "أفكار فيديو قرآن, أفكار ريلز قرآن, محتوى قرآن تيك توك, فيديو قرآن إنستغرام",
  h1: "٣٠ فكرة فيديو قرآن لتيك توك وإنستغرام — محتوى جاهز بلا تكرار",
  h1short: "٣٠ فكرة فيديو قرآن لتيك توك",
  read: "٧",
  lead: "المشكلة ليست في الأداة بل في الفكرة: أن تفتح المولّد كل يوم وأمامك خيار واحد فقط. هذه قائمة مقسّمة بفئات تكفيك شهرًا كاملًا — انسخها في قائمة نشرك وابدأ اليوم.",
  cta: [{ t: "🎬 حوّل فكرة إلى فيديو", h: "/#/" }, { t: "💡 أداة المواضيع", h: "/#/tool/topics" }],
  body: `
  <section class="lp-sec">
    <h2>الفئة الأولى: تحفيز وإنذار (٨ أفكار)</h2>
    <ol>
      <li>﴿ وَمَن يَتَّقِ اللَّهَ يَجْعَل لَّهُ مَخْرَجًا ﴾ — افتح على كلمة «مخرجًا».</li>
      <li>﴿ إِنَّ مَعَ الْعُسْرِ يُسْرًا ﴾ — النص في أول ثانيتين قبل أي كلام.</li>
      <li>﴿ فَاذْكُرُونِي أَذْكُرْكُمْ ﴾ — مقطع قصير متكرر الأداء.</li>
      <li>﴿ وَقُل رَّبِّ زِدْنِي عِلْمًا ﴾ — يناسب جمهور التعلّم.</li>
      <li>﴿ أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ ﴾ — للحالات الصباحية.</li>
      <li>﴿ إِنَّ اللَّهَ مَعَ الصَّابِرِينَ ﴾ — بعد أي يوم صعب.</li>
      <li>﴿ وَهُوَ مَعَكُمْ أَيْنَ مَا كُنتُمْ ﴾ — صوت هادئ + خلفية ليلية.</li>
      <li>﴿ لَئِن شَكَرْتُمْ لَأَزِيدَنَّكُمْ ﴾ — افتتاحية لمقاطع الشكر.</li>
    </ol>
  </section>
  <section class="lp-sec">
    <h2>الفئة الثانية: أمان وطمأنينة (٧ أفكار)</h2>
    <ul>
      <li>﴿ قُل لَّا أَمْسِكُ عَلَيْكُم مِّن شَيْءٍ مِّن شَهَادَةٍ ﴾ + دعاء الهمّ.</li>
      <li>﴿ وَنُنَزِّلُ مِنَ الْقُرْآنِ مَا هُوَ شِفَاءٌ وَرَحْمَةٌ ﴾ — للمرضى والداعين.</li>
      <li>﴿ قُلْ هُوَ اللَّهُ أَحَدٌ ﴾ كاملة + الفلق والناس في ثلاثية نشر.</li>
      <li>﴿ إِنَّهُ لَا يَيْأَسُ مِن رَّوْحِ اللَّهِ إِلَّا الْقَوْمُ الْكَافِرُونَ ﴾.</li>
      <li>﴿ فَإِنَّ مَعَ الْعُسْرِ يُسْرًا * إِنَّ مَعَ الْعُسْرِ يُسْرًا ﴾ — تكرار الآية نفسه رسالة.</li>
      <li>﴿ وَمَا تَوْفِيقِي إِلَّا بِاللَّهِ ﴾ — للأعمال والامتحانات.</li>
      <li>﴿ إِنَّ اللَّهَ يُدَافِعُ عَنِ الَّذِينَ آمَنُوا ﴾ — لمن يحتاج الطمأنينة.</li>
    </ul>
  </section>
  <section class="lp-sec">
    <h2>الفئة الثالثة: قصص مختصرة وعبر (٧ أفكار)</h2>
    <div class="feat">
      <div><b>قصة أصحاب الكهف</b>آيات معدودة من الكهف مع عنوان «ناموا300 سنة».</div>
      <div><b>ذي القرنين</b>الآيات القصيرة التي تحكي سيرته في مقطع واحد.</div>
      <div><b>أصحاب الفيل</b>تكرار + بداية «ألم تر…» في أول3 ثوانٍ.</div>
      <div><b>الضحى والشرح</b>طمأنينة متتابعة لمن يمرّ بضيق.</div>
      <div><b>قصة نبي أيوب</b>﴿ عَسَىٰ رَبِّي أَن يُؤْتِيَنِي خَيْرًا ﴾.</div>
      <div><b>الماعون</b>سلسلة أخلاق قصيرة بواقعية عالية التفاعل.</div>
      <div><b>التكاثر</b>تذكير بالآخرة بأسلوب غير مباشر.</div>
    </div>
  </section>
  <section class="lp-sec">
    <h2>الفئة الرابعة: مناسبات وذروات (٨ أفكار)</h2>
    <ul>
      <li><b>الجمعة</b>: آية الكهف — نشرة أسبوعية ثابتة (التفصيل في <a href="/blog/friday-content/" style="color:var(--gold-3)">محتوى الجمعة</a>).</li>
      <li><b>رمضان</b>: سورة الرحمن «فبأي آلاء ربكما تكذبان» سلسلة ليلية (الخطة في <a href="/blog/ramadan-content-plan/" style="color:var(--gold-3)">خطة رمضان</a>).</li>
      <li><b>ليلة القدر</b>: ﴿ لَيْلَةُ الْقَدْرِ خَيْرٌ مِّنْ أَلْفِ شَهْرٍ ﴾ في العشر الأواخر.</li>
      <li><b>أول شهر</b>: رؤية الهلال + دعاء رؤية الهلال.</li>
      <li><b>العام الدراسي</b>: ﴿ رَبِّ زِدْنِي عِلْمًا ﴾ مركّز في سبتمبر.</li>
      <li><b>الأم</b>: ﴿ وَقُل رَّبِّ ارْحَمْهُمَا كَمَا رَبَّيَانِي صَغِيرًا ﴾ في ذكرى الأمهات.</li>
      <li><b>السفر</b>: ﴿ وَهُوَ مَعَكُمْ أَيْنَ مَا كُنتُمْ ﴾ بداية رحلات.</li>
      <li><b>اليوم العالمي للسلامة</b>بترميز إسلامي: ﴿ وَلَا تَقُولُوا لِمَن يُقْتَلُ فِي سَبِيلِ اللَّهِ أَمْوَاتٌ ﴾ أو ﴿ مَن قَتَلَ نَفْسًا ﴾ بتحريز فقهي دقيق.</li>
    </ul>
    <div class="callout"><b>قاعدة عدم التكرار:</b> كل آية تُنشر مرة واحدة بصياغة بصرية مختلفة كل30 يومًا على الأقل — وللتفادي استخدم <a href="/#/tool/topics" style="color:var(--gold-3)">أداة المواضيع</a> لتوليد البدائل بترتيب موضوعي.</div>
  </section>
  <section class="lp-sec">
    <h2>روزنامة أسبوعية جاهزة</h2>
    <table class="tbl">
      <tr><th>اليوم</th><th>المحتوى</th><th>الوقت المقترح</th></tr>
      <tr><td>السبت</td><td>تحفيز (الفئة الأولى)</td><td><b>مساءً</b></td></tr>
      <tr><td>الأحد</td><td>قصة قصيرة</td><td><b>بعد المغرب</b></td></tr>
      <tr><td>الاثنين</td><td>دعاء/طمأنينة</td><td><b>صباحًا</b></td></tr>
      <tr><td>الثلاثاء</td><td>تذكير بآخرة</td><td><b>ليلًا</b></td></tr>
      <tr><td>الأربعاء</td><td>الفئة الرابعة الموسمية</td><td><b>مساءً</b></td></tr>
      <tr><td>الخميس</td><td>تحضير الجمعة</td><td><b>مساءً</b></td></tr>
      <tr><td>الجمعة</td><td>آية الكهف</td><td><b>بعد الفجر</b></td></tr>
    </table>
    <p>اصنع ثلاث مقاطع دفعة واحدة (15 دقيقة في المولّد) وجدولها — النشر المنتظم أقوى من الكثرة المتباعدة.</p>
  </section>`,
  faq: [
    ["كم عدد المقاطع أسبوعيًا كافيًا؟", "من4 إلى7 مقاطع تكفي مع الانتظام؛ الأهم تكرار وقت النشر نفسه يوميًا حتى تستقر العادة لدى الجمهور."],
    ["هل أفكار الآيات متكررة عند الجميع؟", "الآية نفسها قد تتكرر، لكن الفارق في أول3 ثوانٍ وتنسيق النص والخلفية — لذلك استخدم تشكيل بصري مختلفًا لكل سلسلة."],
    ["هل أستطيع نشر نفس الآية أكثر من مرة؟", "نعم بعد30 يومًا تقريبًا وبصياغة وإطار جديدين؛ القصص القصيرة (الكهف، أصحاب الفيل) تحتمل التكرار الأسبوعي بزوايا مختلفة."],
    ["من أين أجيب قائمة المواضيع كاملة؟", "من أداة المواضيع داخل الموقع: تصفح حسب الموضوع ثم حوّل كل آية إلى فيديو بضغطة واحدة."]
  ],
  links: [
    ["/#/tool/topics", "أداة المواضيع"],
    ["/ar/quran-video-tiktok/", "دليل تيك توك"],
    ["/ar/short-quran-verses-video/", "أقصر الآيات"],
    ["/", "المولّد"]
  ]
},
{
  slug: "free-quran-video-maker",
  cardTitle: "هل توجد أداة مجانية؟",
  cardDesc: "الجواب القصير: نعم — والطويل يقارن الحدود الحقيقية.",
  title: "هل توجد أداة مجانية لصنع فيديو قرآن؟ الجواب القصير والطويل | مدونة قرآن ريلز",
  desc: "الجواب: نعم — قرآن ريلز يصنع فيديو قرآن عموديًا مجانيًا بلا حدود وبلا حساب. مقارنة عملية مع أدوات «المجانية» التي تضع حدًّا يوميًا أو علامة مائية.",
  keywords: "أداة مجانية صنع فيديو قرآن, قرآن ريلز مجاني, فيديو قرآن بدون حدود, free quran video maker",
  h1: "هل توجد أداة مجانية لصنع فيديو قرآن؟ الجواب القصير والطويل",
  h1short: "هل توجد أداة مجانية لصنع فيديو قرآن؟",
  read: "٥",
  lead: "الجواب القصير: <b>نعم</b> — «قرآن ريلز» يصنع لك فيديو قرآن عموديًا MP4 كاملًا مجانًا، بلا حساب ولا علامة مائية ولا حد لعدد الفيديوهات. والطويل: كيف تميّز المجاني الحقيقي من «تجربة المجاني»؟",
  cta: [{ t: "🎬 جرّب بنفسك مجانًا", h: "/#/" }, { t: "قارن الأدوات", h: "/blog/compare-quran-video-tools/" }],
  body: `
  <section class="lp-sec">
    <h2>الجواب القصير</h2>
    <div class="callout"><b>نعم، ومن دون قيود:</b> تختار السورة والآيات والقارئ والخلفية ← معاينة حية ← تصدير MP4 <b>1080×1920</b> بلا علامة مائية. لا اشتراك، لا رصيد، لا رفع ملفات إلى خادم — كل شيء يعمل داخل متصفحك. <a href="/#/">افتح المولّد الآن</a>.</div>
    <p>وليس دعاءً تسويقيًا: المولّد مجاني بالكامل لأن نموذج الموقع صدقة جارية بلا إعلانات ولا تتبّع — وهو ما يزيل المبرر الأساسي لوضع حدود في منصات أخرى.</p>
  </section>
  <section class="lp-sec">
    <h2>الجواب الطويل: أنواع «المجاني» في سوق أدوات قرآن الفيديو</h2>
    <table class="tbl">
      <tr><th>النموذج</th><th>ما تحصل عليه فعلًا</th><th>السمة المميزة</th></tr>
      <tr><td>مجاني بلا حدود (قرآن ريلز)</td><td><b>تصدير غير محدود + بلا علامة مائية + بلا حساب</b></td><td>يعمل في المتصفح بلا رفع</td></tr>
      <tr><td>حد يومي مجاني</td><td>بضع فيديوهات يوميًا (١٠ مثل بعض المواقع المتخصصة)</td><td>يحتاج اشتراكًا للنمو</td></tr>
      <tr><td>رصيد/كريدت</td><td>دقيقتان تجربة ثم شراء رصيد</td><td>دفع محلي في بعض الخدمات</td></tr>
      <tr><td>سحابة يومية</td><td>عدد محدود من التصديرات السحابية عالية الدقة يوميًا</td><td>التصدير البطيء أو الانتظار</td></tr>
      <tr><td>تطبيق متجر</td><td>مجانًا بعلامة مائية ثم اشتراك لإزالتها</td><td>شراء داخل التطبيق</td></tr>
    </table>
  </section>
  <section class="lp-sec">
    <h2>ثلاثة أسئلة تكشف «المجاني الحقيقي»</h2>
    <ul>
      <li><b>هل هناك حد بعددي معلن؟</b> إن نصت الخطة المجانية على «١٠ فيديو يوميًا» فأنت أمام تجربة، لا أداة مجانية.</li>
      <li><b>هل تُرفع ملفاتك؟</b> الرفع يعني خوادم وانتظارًا ومخاطر خصوصية — والمعالجة المحلية أسرع وأأمن.</li>
      <li><b>هل أحتاج حسابًا لأول فيديو؟</b> التسجيل قبل القيمة إشارة إلى أن المجانية شرط، لا منتج.</li>
    </ul>
    <p>التفاصيل الكاملة للمقارنة في <a href="/blog/compare-quran-video-tools/" style="color:var(--gold-3)">قرآن ريلز مقابل أبرز منافسين</a>، ولأسماء المنصات وحدودها المعلنة راجع إعلاناتهم بنفسك — نحن نضع أرقامنا مكشوفة: <b>٤٧ قارئًا · ١١٤ سورة · ٨ ترجمات · ١٤ خلفية · بلا حدود</b>.</p>
  </section>
  <section class="lp-sec">
    <h2>ماذا تحصل عليه في النسخة المجانية كاملًا؟</h2>
    <div class="feat">
      <div><b>تصدير MP4/WebM</b>1080×1920 عمودي للمنصات كلها.</div>
      <div><b>معاينة حية</b>قبل التصدير — بلا انتظار أبدًا.</div>
      <div><b>٣٢ أداة إسلامية</b>مواقيت، قبلة، أذكار، زكاة… مجانًا أيضًا.</div>
      <div><b>أوفلاين PWA</b>ثبّته على جهازك واعمل بدون إنترنت.</div>
      <div><b>حساب اختياري</b>للميزة الواحدة: جدولة النشر إلى يوتيوب.</div>
      <div><b>خادم MCP</b>لمساعدات الذكاء أن تستدعي الموقع مباشرة.</div>
    </div>
  </section>`,
  faq: [
    ["هل الموقع مجاني فعلًا أم تجربة محدودة؟", "مجاني كامل بلا عدّاد يومي ولا رصيد ولا علامة مائية — النموذج صدقة جارية بلا إعلانات ولا تتبّع."],
    ["أين المقابل إن كان مجانيًا؟", "لا مقابل مالي ولا جمع بيانات؛ الموقع لا يبيع شيئًا ولا يعرض إعلانات، وتغطية مصاريفه على صاحبه."],
    ["ما الفرق بينه وبين التطبيقات المجانية؟", "التطبيقات غالبًا تضع علامة مائية ثم تبيع الإزالة؛ هنا التصدير نظيف من أول فيديو ومن المتصفح مباشرة."],
    ["هل أحتاج إنترنت دائمًا؟", "بعد أول فتح يعمل التطبيق أوفلاين كاملًا — والتصدير لا يحتاج اتصالًا أصلًا."]
  ],
  links: [
    ["/", "افتح المولّد"],
    ["/blog/compare-quran-video-tools/", "مقارنة الأدوات"],
    ["/ar/quran-video-maker/", "صفحة صانع الفيديو"],
    ["/about/", "لماذا مجاني؟"]
  ]
},
{
  slug: "compare-quran-video-tools",
  cardTitle: "مقارنة أدوات الفيديو",
  cardDesc: "قرآن ريلز مقابل quranreels.tech وtashghil وquranvideomaker — جدول صريح.",
  title: "قرآن ريلز مقابل أبرز منافسين: أي أداة لفيديو القرآن أفضل؟ | مدونة قرآن ريلز",
  desc: "مقارنة صريحة بين قرآن ريلز وquranreels.tech وtashghil.pro وquranvideomaker: السعر، الحدود، الحساب، العلامة المائية، الرفع، الجدولة، ودعم MCP — بأرقاف معلنة.",
  keywords: "مقارنة أدوات فيديو قرآن, quranreels بديل, tashghil مقارنة, أفضل مصنع فيديو قرآن",
  h1: "قرآن ريلز مقابل أبرز منافسين: أي أداة أفضل؟",
  h1short: "قرآن ريلز مقابل أبرز منافسين",
  read: "٦",
  lead: "بدل بحث «أفضل أداة» في صفحات التسويق، هذا جدول واحد بأرقاف معلنة من كل طرف — ثم نقول لك بصراحة متى يتفوّق كلٌّ منهم ومتى نتفوّق نحن.",
  cta: [{ t: "جرّب قرآن ريلز", h: "/#/" }, { t: "هل مجاني فعلًا؟", h: "/blog/free-quran-video-maker/" }],
  body: `
  <section class="lp-sec">
    <h2>جدول المقارنة</h2>
    <table class="tbl">
      <tr><th></th><th>قرآن ريلز</th><th>quranreels.tech</th><th>tashghil.pro</th><th>quranvideomaker.com</th></tr>
      <tr><td>السعر</td><td><b>مجاني بلا حدود</b></td><td>مجاني بحد يومي + خطط مدفوعة</td><td>كريدت (تجربة2 دقيقة ثم شراء)</td><td>مجاني محدود + مدفوع</td></tr>
      <tr><td>الحد اليومي المعلن</td><td><b>لا يوجد</b></td><td>≈10 فيديو/يوم في المجاني</td><td>حسب الرصيد</td><td>3 تصديرات سحابية1080p يوميًا في المجاني</td></tr>
      <tr><td>حساب مطلوب؟</td><td><b>لا</b></td><td>لا غالبًا</td><td>لا للتجربة</td><td>لا</td></tr>
      <tr><td>علامة مائية</td><td><b>لا</b></td><td>حسب الخطة</td><td>حسب الخطة</td><td>حسب الخطة</td></tr>
      <tr><td>رفع ملفاتك لخوادمهم</td><td><b>لا — يعمل في متصفحك</b></td><td>معالجة سحابية</td><td>معالجة سحابية</td><td>خيار متصفح + سحابة</td></tr>
      <tr><td>قارئون</td><td><b>47</b></td><td>عشرات+</td><td>229</td><td>42</td></tr>
      <tr><td>ترجمات داخل الفيديو</td><td><b>8 لغات</b></td><td>نعم</td><td>7 لغات</td><td>22 ترجمة + كلمة بكلمة</td></tr>
      <tr><td>جدولة نشر آلية</td><td><b>نعم (اختياري)</b></td><td>نعم</td><td>يدوي/مزايا اجتماعية</td><td>لا</td></tr>
      <tr><td>خادم MCP للذكاء</td><td><b>نعم — بلا مفتاح</b></td><td>نعم (يحوي وثائق مطوّرين)</td><td>لا</td><td>لا</td></tr>
      <tr><td>تتبّع إعلاني</td><td><b>لا شيء</b></td><td>غير معلن</td><td>Google Analytics</td><td>غير معلن</td></tr>
    </table>
    <p style="font-size:.85rem">الأرقاف مأخوذة من صفحات هؤلاء المعلنين وأسعارهم المنشورة حتى تاريخ كتابة المقال (أكتوبر2026)؛ إن تغيّر شيء عند طرف فراجع مصدره مباشرة. نحن لا ندّعي التفوق في كل خانة — ندّعي التفوق في خانة «بلا حدود وبلا رفع».</p>
  </section>
  <section class="lp-sec">
    <h2>متى يتفوّق غيرنا؟ (بكل صراحة)</h2>
    <ul>
      <li><b>tashghil.pro</b>: إن أردت229 قارئًا وقوالب سينمائية جاهزة ومستعد للدفع بالكريدت.</li>
      <li><b>quranvideomaker.com</b>: إن احتجت22 ترجمة وتوقيت كلمة-بكلمة خاص، ولا يزعجك الحد اليومي أو رفع الملفات.</li>
      <li><b>quranreels.tech</b>: إن كنت داخل منظومته المتقدمة (n8n وأتمتة واسعة) وحدّ الـ10 فيديو/يوم يكفيك.</li>
      <li><b>التطبيقات</b>: إن كنت تفضّل تطبيقًا أصليًّا داخل هاتفك وتقبل العلامة المائية ثم الاشتراك.</li>
    </ul>
  </section>
  <section class="lp-sec">
    <h2>متى نتفوّق نحن؟</h2>
    <div class="feat">
      <div><b>النشر اليومي الحقيقي</b>عشرة مقاطع أو مئة — الفرق سلبي عندنا.</div>
      <div><b>الخصوصية</b>لا رفع للصوت ولا للنص ولا للصورة: كل شيء Canvas داخل جهازك.</div>
      <div><b>بلا حساب أصلًا</b>أول فيديو في أقل من دقيقة دون تسجيل.</div>
      <div><b>الأتمتة مع خيارية الحساب</b>النشر المجدول موجود لكنه ليس شرطًا للاستخدام.</div>
      <div><b>32 أداة ومواقيت وقبلة</b>منظومة يومية حول الفيديو لا مولّد وحده.</div>
      <div><b>بلا تتبّع</b>لا GA ولا كوكيز إعلانية — خصوصية معلنة في <a href="/privacy/" style="color:var(--gold-3)">سياسة الخصوصية</a>.</div>
    </div>
    <div class="callout"><b>نصيحة حيادية:</b> جرّب مولّدًا واحدًا بثلاث مقاطع فعلية قبل أن تقارن بالمواصفات — سرعة التصدير ووضوح النص على شاشة الجوال يحسمان أكثر من أي جدول.</div>
  </section>`,
  faq: [
    ["هل المقارنة متحيزة لصالحكم؟", "الجدول يضع ميزاتنا وميزات غيرنا معًا بما في ذلك من نتفوّق عليهم فيه (عدد القارئين والترجمات) — والحكم لك بعد التجربة الفعلية."],
    ["هل الأسعار المذكورة محدثة؟", "مبنية على إعلاناتهم في أكتوبر2026 وقد تتغير؛ راجع المصدرين إن كانت الأرقام قرارًا شرائيًا."],
    ["لماذا تذكرون منافسكم باسمهم؟", "لأن المقارنة بلا أسماء لا تُفيد أحدًا — ومن يريد البديل عن أي أداة سيرجع لصفحاتها في هذا الجدول."],
    ["ما أفضل أداة لو بدأت اليوم بأقل جهد؟", "ابدأ بالمولّد هنا (بلا حساب)، وإن احتجت قالبًا سينمائيًا جاهزًا فجرّب نموذج الكريدت مرة واحدة وأنت مرتاح للمقارنة الفعلية نفسها."]
  ],
  links: [
    ["/", "جرّب قرآن ريلز"],
    ["/about/", "لماذا نحن"],
    ["/blog/free-quran-video-maker/", "المجاني الحقيقي"],
    ["/developers/mcp/", "MCP للمطوّرين"]
  ]
},
{
  slug: "mistakes-quran-shorts",
  cardTitle: "٧ أخطاء في المقاطع",
  cardDesc: "تقطيع الآية، نص غير مقروء، بداية باردة… وكيف تتجنّبها.",
  title: "7 أخطاء شائعة في مقاطع القرآن القصيرة — وكيف تتجنّبها | مدونة قرآن ريلز",
  desc: "أخطاء تقتل تفاعل المقاطع القرآنية: تقطيع الآية عن سياقها، نص غير واضح، خلفية مزدحمة، بداية باردة، وصف بلا سورة، توازن صوت سيء، ونشر غير منتظم — مع الحل لكل خطأ.",
  keywords: "أخطاء مقاطع قرآن, لماذا ريلز قرآني لا يتفاعل, تحسين فيديو قرآن, تيك توك قرآن",
  h1: "٧ أخطاء شائعة في مقاطع القرآن القصيرة — وكيف تتجنّبها",
  h1short: "٧ أخطاء شائعة في المقاطع القصيرة",
  read: "٦",
  lead: "أغلب المقاطع القرآنية التي «لا تُشاهَد» لا تفشل بسبب القارئ ولا الخوارزمية — بل بسبب خطأ بسيط قابل للإصلاح في أول لحظة أو في التنسيق. هذه الأخطاء السبعة الأكثر تكرارًا وحلولها العملية.",
  cta: [{ t: "🎬 اصنع مقطعًا صحيحًا", h: "/#/" }, { t: "٣٠ فكرة جاهزة", h: "/blog/quran-video-ideas/" }],
  body: `
  <section class="lp-sec">
    <h2>الخطأ1: تقطيع الآية عن سياقها</h2>
    <p>نصاف الآية وسط المقطع لتذكير الطرف الآخر — النتيجة معنى مشوّه يُثير التعليقات السلبية ويكسر الثقة. <b>الحل:</b> خذ الآية كاملة بمعناها المكتمل (آية واحدة تكفي)، وإن أردت الجزء فاذكر «…تتم في السورة كذا» في الوصف.</p>
    <h2>الخطأ2: نص غير واضح أو بتشكيل ضعيف</h2>
    <p>شاشة الجوال صغيرة؛ خط رفيع أو تشكيل باهت أو حجم صغير = مشاهد يمرّ. <b>الحل:</b> النص العثماني كبير عالي التباين، خلفية هادئة بعيدة عن مناطق الحروف، ولا تضع عناصر فوق الآية إطلاقًا. المولّد يفرض هذا التخطيط (1080×1920 بنص مركزي) افتراضيًّا.</p>
    <h2>الخطأ3: بداية باردة (أول3 ثوانٍ)</h2>
    <p>شعار يدور، «مرحبًا بكم»، صمت… الخوارزمية لا تنتظر. <b>الحل:</b> افتح على الكلمة الأقوى في الآية أو على صوت التلاوة مباشرة بلا مقدمات.</p>
    <h2>الخطأ4: خلفية تنافس النص</h2>
    <p>صور مزدحمة أو ألوان فاقعة تجعل الحروف تختفي عند التصغير. <b>الحل:</b> خلفية داكنة هادئة أو تدرّج (14 خلفية جاهزة في المولّد) أو صورتك إن كانت بسيطة.</p>
    <h2>الخطأ5: وصف بلا سورة ولا رقم</h2>
    <p>المتابع لا يعرف مصدر الآية فيغادر. <b>الحل:</b> سطر الوصف: جملة قصيرة + «[الشمس وضحاها · الآية3]» + وسوم بسيطة. الإحالة الصريحة تزيد المصداقية وتُسهّل النشر.</p>
    <h2>الخطأ6: توازن الصوت</h2>
    <p>تلاوة خافتة مع ضجيج خلفي، أو صوت يقطع عند النهاية. <b>الحل:</b> اسمع المعاينة كاملة قبل التصدير (المولّد يمنحك معاينة حية)، وتجنّب أي موسيقى خلف التلاوة — النص الصوتي القائم أصلٌ ويانٍ.</p>
    <h2>الخطأ7: نشر غير منتظم</h2>
    <p>خمسة مقاطع ثم صمت أسبوعين = الضربة الأقوى على النمو. <b>الحل:</b> روزنامة ثابتة (جدول جاهز في <a href="/blog/quran-video-ideas/" style="color:var(--gold-3)">مقال الأفكار30</a>) وجدولة تلقائية إن احتجت (انظر <a href="/blog/schedule-quran-reels/" style="color:var(--gold-3)">دليل الجدولة</a>).</p>
    <div class="callout"><b>فحص قبل النشر (30 ثانية):</b> هل الآية كاملة؟ هل النص يُقرأ بوضوح على شاشة6 بوصات؟ هل أول3 ثوانٍ فيها معنى؟ هل ذُكرت السورة في الوصف؟ إن أجبت بنعم فأنت جاهز.</div>
  </section>`,
  faq: [
    ["هل الخطأ يؤثر فعلًا في الوصول؟", "الوصول يتأثر بالتشبّع والبقاء (watch time)؛ الأخطاء الخمسة الأولى تقتل البقاء مباشرة لأنها تُفقد المشاهد السبب أو الوضوح في ثوانٍ."],
    ["هل الموسيقى الخلفية ممنوعة؟", "ليست ممنوعة تقنيًّا لكنها تُضعف وضوح التلاوة وتستهلك انتباه الجمهور؛ والفيديو القرآني المؤثر يُبنى على الصوت الأصلي."],
    ["كم وصفًا يكفي؟", "سطران: عبارة تمسّ المعنى + ذكر السورة والآية + وسوم2-4. لا حاجة لِمقالات طويلة في الوصف."],
    ["وماذا لو نشرت مقطعًا فيه خطأ؟", "عدّله أو احذفه وأعد النشر مصحّحًا — لا تترك خطأً نصيًّا منشورًا؛ الثقة أهم من رخص الاحتفاظ بالمنشور."]
  ],
  links: [
    ["/ar/quran-video-tiktok/", "دليل تيك توك"],
    ["/blog/quran-video-ideas/", "30 فكرة"],
    ["/ar/quran-video-with-translation/", "ترجمة داخل الفيديو"],
    ["/", "المولّد"]
  ]
},
{
  slug: "schedule-quran-reels",
  cardTitle: "الجدولة والأتمتة",
  cardDesc: "انشر يوميًا دون عناء: دفعة واحدة + جدولة آلية.",
  title: "كيف تنشر ريلز قرآنيًا يوميًا دون عناء: دليل الجدولة والأتمتة | مدونة قرآن ريلز",
  desc: "روتين عملي لنشر يومي منتظم: صناعة دفعات، ربط قناة يوتيوب بحساب اختياري، جدولة الفيديو بالبوست والوسوم، وأتمتة يومية06:15 بتوقيت القاهرة.",
  keywords: "جدولة ريلز قرآن, نشر تلقائي يوتيوب, أتمتة محتوى قرآن, نشر يومي ريلز",
  h1: "كيف تنشر ريلز قرآنيًا يوميًا دون عناء: دليل الجدولة والأتمتة",
  h1short: "دليل الجدولة والأتمتة",
  read: "٦",
  lead: "النشر اليومي لا يحتاج ساعات — يحتاج نظامًا: دفعة إنتاج واحدة، وجدولة تفعل الباقي. إليك الروتين الكامل داخل «قرآن ريلز» من الفكرة حتى النشر الآلي.",
  cta: [{ t: "ابدأ إنشاء فيديو", h: "/#/" }, { t: "افتح صفحة الحساب", h: "/#/" }],
  body: `
  <section class="lp-sec">
    <h2>لماذا تفشل المحاولات اليدوية؟</h2>
    <p>لأنها تربط «النشر» بـ«الوقت الفوري»: تفتح التطبيق، تختار، تصدّر، ترفع… وحين ينشغل يومك يتوقف النشر فينهار الأسبوع كله. القاعدة الصحيحة: <b>افصل الإنتاج عن النشر</b> — أنت تنتج حين تملك تركيزًا، والجدولة تنشر حين يحين الوقت.</p>
  </section>
  <section class="lp-sec">
    <h2>النموذج المقترح: دفعة كل3 أيام</h2>
    <div class="feat">
      <div><b>1 · اختر3 آيات</b>من المواضيع أو القائمة الجاهزة (خلال15 دقيقة).</div>
      <div><b>2 · صمّمها3 معًا</b>نفس الأسلوب، خلفية مختلفة، ترجمة اختيارية.</div>
      <div><b>3 · صدّرها3</b>معاينة ← إنشاء ← تحميل MP4 (ثوانٍ لكل واحد).</div>
      <div><b>4 · جدولها</b>من صفحة الحساب: عنوان + وسوم + وقت النشر لكل ملف.</div>
    </div>
    <p>النتيجة: تكفيك25 دقيقة كل3 أيام ليبقى حسابك منتظمًا شهرًا كاملًا.</p>
  </section>
  <section class="lp-sec">
    <h2>ربط القناة والجدولة خطوة بخطوة</h2>
    <ol>
      <li>سجّل دخولك (اختياري — Google أو رابط سحري بالبريد).</li>
      <li>من «حسابي» اضغط <b>اربط يوتيوب</b> ووافق مرة واحدة على الصلاحيات الرسمية.</li>
      <li>عند نتيجة التصدير اضغط <b>جدولة للنشر</b> — أو ارفع الملف من صفحة الحساب.</li>
      <li>اكتب البوست (أو دعه <b>✨ ولّد بوستًا</b> يكتبه لك) + الوسوم + التوقيت.</li>
      <li>احفظ — وسيُنشر في وقته. أو فعّل <b>الأتمتة</b> لنشر المهام المستحقة يوميًا <b>06:15 بتوقيت القاهرة</b>.</li>
    </ol>
    <div class="callout"><b>ملاحظة صراحة:</b> الربط الرسمي المُختبَر حاليًّا هو يوتيوب؛ المنصات الأخرى تظهر في الواجهة وتُفعَّل بحسب توفر الربط. وما لم تُشغّل الأتمتة، لا يُنشر أي شيء من حسابك أبدًا — الجدولة بموافقتك الصريحة لكل مقطع.</div>
  </section>
  <section class="lp-sec">
    <h2>قوالب بوست جاهزة (انسخ وعدّل)</h2>
    <ul>
      <li><b>تحفيز:</b> «﴿ الآية ﴾ — تذكير اليوم. #قرآن #آيات #تلاوة»</li>
      <li><b>قصة:</b> «قصة قصيرة من القرآن في دقيقة واحدة… [السورة/الآية]»</li>
      <li><b>سلسلة:</b> «الجزء3 من «آيات الأمان» — تابع البقية في الحساب»</li>
      <li><b>جمعة:</b> «آية الجمعة — [الاسم]» (جدول أسبوعي في <a href="/blog/friday-content/" style="color:var(--gold-3)">محتوى الجمعة</a>)</li>
    </ul>
    <p>ثم أعد تدوير الملفات المجدولة كمقاطع قصيرة أقصر (15 ثانية) بعد أسبوعين — المحتوى القديم يعود للظهور بحلّة جديدة.</p>
  </section>`,
  faq: [
    ["هل الجدولة تتطلب حسابًا؟", "التصدير والمولّد بلا حساب؛ الجدولة وحدها ميزة الحساب الاختياري المرتبط بقناتك."],
    ["هل ينشر الموقع شيئًا دون إذني؟", "لا — كل مقطع يُجدول بضغوطة صريحة منك، والأتمتة تُفعَّل بقرارك ولا تعمل قبله."],
    ["هل يمكنني التعديل بعد الحفظ؟", "نعم — تفتح المهام المجدولة من صفحة الحساب وتعدّل وقتها أو نصها قبل حلولها."],
    ["ماذا لو ارتبطت أكثر من قناة؟", "تُدار القنوات من نفس صفحة الحساب مع إمكانية فك الربط في أي لحظة بضغطة."]
  ],
  links: [
    ["/#/tools", "الأدوات"],
    ["/blog/quran-video-ideas/", "أفكار المحتوى"],
    ["/ar/quran-video-maker/", "صانع الفيديو"],
    ["/privacy/", "خصوصية الحساب"]
  ]
},
{
  slug: "ramadan-content-plan",
  cardTitle: "خطة رمضان1448",
  cardDesc: "ابدأ قبل8 فبراير2027 — روزنامة وأفكار جاهزة.",
  title: "خطة المحتوى القرآني لرمضان 1448 — ابدأ قبل الفاتح | مدونة قرآن ريلز",
  desc: "خطة عملية لموسم رمضان1448 (1 رمضان ≈8 فبراير2027): بنك محتوى مسبق، روزنامة يومية بتلاوات محددة، أفكار العشر الأواخر، ونصائح نشر تبدأ من اليوم.",
  keywords: "محتوى رمضان قرآن, ريلز رمضان, خطة محتوى رمضاني, فيديو قرآن رمضان",
  h1: "خطة المحتوى القرآني لرمضان 1448 — ابدأ قبل الفاتح",
  h1short: "خطة المحتوى القرآني لرمضان 1448",
  read: "٨",
  lead: "10 ضِعاف الأجر لا تصل إلى المتسوّقين المتأخرين: كل منافسة على «رمضان كونتنت» تبدأ قبل الشهر بشهر. هذه خطة مكتملة — من التقويم حتى آخر ليلة — تُنفَّذ بمولّد واحد وحساب واحد.",
  cta: [{ t: "🎬 اصنع أول دفعة", h: "/#/" }, { t: "30 فكرة عامة", h: "/blog/quran-video-ideas/" }],
  body: `
  <section class="lp-sec">
    <h2>الموعد والتحضير المبكر</h2>
    <p>بحسب تقويم أم القرى: <b>1 رمضان1448هـ ≈ الاثنين8 فبراير2027م</b> (±يوم حسب الرؤية). أي أن أمامك الآن نحو <b>14 أسبوعًا</b> — وقت مثالي لبناء بنك محتوى قبل أن تشتدّ المنافسة في آخر يناير. تحقق من التاريخ أولًا من <a href="/#/tool/hijri" style="color:var(--gold-3)">أداة التاريخ الهجري</a>.</p>
    <div class="callout"><b>قاعدة الموسم:</b> من يبدأ في8 فبراير يلاحق الوعود؛ من يبدأ في20 فبراير يلاحق المنافسين. انشر أول مقطع رمضاني قبل الفاتح بأسبوعين على الأقل.</div>
  </section>
  <section class="lp-sec">
    <h2>المرحلة1: بنك المحتوى (قبل الشهر بأسبوعين)</h2>
    <ul>
      <li><b>٢٠ مقطع تمهيدي</b>: الرحمن مقطّعة «فبأي آلاء ربكما تكذبان» — آية كل مقطع، نفس القالب، خلفية متدرّجة ليلية.</li>
      <li><b>١٠ مقاطع دعاء</b>: الآيات الأربعة في <a href="/#/tool/dua" style="color:var(--gold-3)">الأدعية المأثورة</a> + ﴿ رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً ﴾.</li>
      <li><b>٧ مقاطع ليلة القدر</b>: ﴿ لَيْلَةُ الْقَدْرِ خَيْرٌ مِّنْ أَلْفِ شَهْرٍ ﴾ بصيغ بصرية مختلفة للعشر الأواخر.</li>
      <li><b>سلسلة الكهف</b>للجمعات الأربع+ في رمضان (قريب الكهف من البداية).</li>
      <li><b>عشر المقاطع ذروة السعي/الطواف</b>بوسم «قبل رمضان» للحاجة المتصاعدة.</li>
    </ul>
  </section>
  <section class="lp-sec">
    <h2>المرحلة2: الروزناما اليومية</h2>
    <table class="tbl">
      <tr><th>الوقت</th><th>المحتوى</th></tr>
      <tr><td>بعد الفجر</td><td>مقطع قصير آمن/تحفيز (30 ثانية)</td></tr>
      <tr><td>بعد الظهر</td><td>مقطع سلسلة الرحمن/الآيات المرقّمة</td></tr>
      <tr><td>قبل المغرب بساعة</td><td>مقطع دعاء أو ذكر (وقت استقبال الدعاء)</td></tr>
      <tr><td>بعد التراويح</td><td>الجزء الأطول: قصة قصيرة من القرآن (60-90 ثانية)</td></tr>
      <tr><td>الجمعة</td><td>آية الكهف — نشرة أسبوعية ثابتة (<a href="/blog/friday-content/" style="color:var(--gold-3)">التفاصيل</a>)</td></tr>
    </table>
    <p>اجعل النشرين الثابتين (الفجر + الكهف) هما الفريتان اللتان لا تُلغوان مهما انشغلت — والباقي بالطاقة المتاحة. أدوات الموقع تخدم الموسم: <a href="/#/tool/adhkar" style="color:var(--gold-3)">الأذكار</a> للنشر المصاحب، <a href="/#/tool/prayer" style="color:var(--gold-3)">المواقيت</a> لضبط النشر بعد كل صلاة.</p>
  </section>
  <section class="lp-sec">
    <h2>المرحلة3: العشر الأواخر وليالي القدر</h2>
    <ul>
      <li>اكتمل بنك المقاطع قبل الليلة21 — لا ارتجال في العشر.</li>
      <li>غطِّ الليلات الفردية (21،23،25،27،29) بمقطع مخصص مسبقًا.</li>
      <li>أعد تدوير «لَيْلَةُ الْقَدْرِ» بصياغات مختلفة كل ليلة فردية — التكرار هنا متوقَّع ومطلوب.</li>
      <li>ليلة30: مقطع ختامي شكر + مقطع عيد مبكر (لا تفوّت فرصة العيد: يوتيوب يستقبل محتوى العيد صباحه).</li>
    </ul>
  </section>
  <section class="lp-sec">
    <h2>ما بعد رمضان مباشرة</h2>
    <p>الشهر ينتهي والحساب يبقى: أعد استخدام بنك رمضان كـ«أرشيف موسمي» في رمضان1449 (يتحرك11 يومًا للأمام)، وحوّل5 من المقاطع الأكثر مشاهدة إلى سلاسل متواصلة في شعبان. المحتوى الموسمي الجيد يُعاد إنتاجه كل عام بتغييرات صغيرة — والروابط القديمة تعود لتتدرّج مبكرًا.</p>
  </section>`,
  faq: [
    ["متى أبدأ فعليًا؟", "ابدأ الآن إن كنت تقرأ هذا قبل يناير2027؛ الخطوة الأولى بنك المقاطع التمهيدية (الرحمن والدعاء) لأنها تُنتج مرة وتُنشر طوال الشهر."],
    ["كم مقطعًا يوميًا في رمضان؟", "من2 إلى4 تكفي مع انتظام؛ ونسبة الواحد المؤثر خير من عشرة متفرقة بلا جدول."],
    ["هل أستخدم نفس القالب طوال الشهر؟", "استخدم قالبين أو ثلاثة بالتناوب — الاتساق يبني هوية بصرية، والتنوّع المفرط يشتّت، والتشابه التام تملّ."],
    ["هل المحتوى القرآني يقبل الموسيقى في رمضان؟", "الأصل في المقاطع القرآنية الصوت الأصلي بلا موسيقى؛ مقاطع الذكر والأدعية تحتمل الهدوء البصري أكثر مما تحتمل الطرب."]
  ],
  links: [
    ["/blog/friday-content/", "محتوى الجمعة"],
    ["/blog/quran-video-ideas/", "30 فكرة"],
    ["/blog/schedule-quran-reels/", "الجدولة"],
    ["/#/tool/hijri", "التاريخ الهجري"]
  ]
},
{
  slug: "friday-content",
  cardTitle: "محتوى الجمعة",
  cardDesc: "آيات الجمعة وأوقات النشر وروزنامة أسبوعية ثابتة.",
  title: "محتوى الجمعة: أفكار ريلز وآيات لكل جمعة من السنة | مدونة قرآن ريلز",
  desc: "دليل ثابت لمحتوى الجمعة: آية الكهف والسجدة، أفضل أوقات النشر الخميس والجمعة، وروزنامة أسبوعية تجعل كل جمعة نشرة جاهزة دون ارتجال.",
  keywords: "محتوى الجمعة, فيديو آية الجمعة, ريلز الجمعة, سورة الكهف فيديو",
  h1: "محتوى الجمعة: أفكار ريلز وآيات لكل جمعة من السنة",
  h1short: "محتوى الجمعة: أفكار وأوقات نشر",
  read: "٥",
  lead: "الجمعة أقوى موعد ثابت في روزنامة الجمهور المسلم: الناس يفتحون هاتفهم صباح الجمعة باحثين عن الذكر والآية. اجعلها «نشرتك الأسبوعية» الجاهزة — كل خميس تنتج، وكل جمعة تنشر.",
  cta: [{ t: "🎬 اصنع مقطع الجمعة", h: "/#/" }, { t: "خطة رمضان", h: "/blog/ramadan-content-plan/" }],
  body: `
  <section class="lp-sec">
    <h2>المحتوى الأساسي: آية الكهف</h2>
    <p>سورة الكهف نور بين الجمعة والجمعة — ابدأ بهذه الآيات الثلاث موزّعة على ثلاث جمعات: ﴿ إِنَّ اللَّهَ نُورُ السَّمَاوَاتِ وَالْأَرْضِ ﴾ (مقدّمة بصرية للنور) · ﴿ مَّنْ أَحْسَنُ دِعْةً وَأَحْسَنُ صَوْتًا ﴾ (الأذكياء وصوتهم) · ﴿ وَاصْبِرْ نَفْسَكَ مَعَ الَّذِينَ يَدْعُونَ رَبَّهُمْ ﴾ (الصباح). وإن أردت النص الكامل فمقطع واحد بآيات الافتتاح كل جمعة بصياغة بصرية جديدة.</p>
    <div class="callout"><b>نصيحة تكرار:</b> كل جمعة يعود الجمهور لأمر نفسه؛ تغيّر الخلفية ونقطة البدء في النص أسبوعيًا وأبقِ «هوية» ثابتة (لون، موقع توقيع) ليستطيع التعرّف عليك في الـFeed.</div>
  </section>
  <section class="lp-sec">
    <h2>خيارات أسبوعية أخرى</h2>
    <div class="feat">
      <div><b>سجدة المس</b>﴿ تُسَبِّحُ لِلَّهِ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ ﴾ — صوت عالٍ بصياغة سادة.</div>
      <div><b>آية النور الكاملة</b>مقطع أطول (60 ثانية) لمن يحب التأمل.</div>
      <div><b>السلام عليكم</b>آيات التحيّات لافتتاح الجمعة اجتماعيًّا.</div>
      <div><b>الدعاء المكتوب</b>﴿ رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً ﴾ — الأكثر مشاركة يوم الجمعة.</div>
      <div><b>ذكر الجمعة</b>سبحان الله وبحمده (مقطع صامت النص عالي التباين).</div>
      <div><b>قصة نبي يوم الجمعة</b>من الكهف بعناوين متتابعة.</div>
    </div>
  </section>
  <section class="lp-sec">
    <h2>أوقات النشر المثلى</h2>
    <table class="tbl">
      <tr><th>التوقيت</th><th>المحتوى</th><th>لماذا؟</th></tr>
      <tr><td><b>الخميس7-9 مساءً</b></td><td>الخُطبة التمهيدية: «استعد لجمعة…»</td><td>الناس يخطّطون لآخر الأسبوع</td></tr>
      <tr><td><b>الجمعة بعد الفجر</b></td><td>آية الكهف</td><td>ذروة البحث عن نور الجمعة</td></tr>
      <tr><td><b>الجمعة11ص-1م</b></td><td>الدعاء/التحيّات</td><td>قبل الصلاة مباشرة</td></tr>
      <tr><td><b>الجمعة بعد العصر</b></td><td>القصة القصيرة</td><td>استراحة ما بعد الصلاة</td></tr>
    </table>
    <p>التوقيتات بتوقيت جمهورك الأكبر — اضبطها أول أسبوعين ثم ثبّتها، والجدولة من <a href="/blog/schedule-quran-reels/" style="color:var(--gold-3)">دليل الجدولة</a> تفعلها دون يقظة.</p>
  </section>
  <section class="lp-sec">
    <h2>روزنامة الثابتة</h2>
    <ul>
      <li><b>الثلاثاء</b>: اختيار الآية من <a href="/#/tool/topics" style="color:var(--gold-3)">المواضيع</a>.</li>
      <li><b>الأربعاء</b>: التصميم والتصدير (دفعة تشمل مقعدين).</li>
      <li><b>الخميس</b>: الجدولة بوقت الجمعة.</li>
      <li><b>الجمعة</b>: تفاعل مع التعليقات أول30 دقيقة بعد النشر (أقوى إشارة تشجيعية).</li>
      <li><b>السبت</b>: مراجعة مشاهدات الأسبوع + تعديل وقت النشر إن لزم.</li>
    </ul>
  </section>`,
  faq: [
    ["هل آية الكهف كل جمعة لا تملّ؟", "التكرار السنوي مرغوب فيها أصلًا، والتملّل يأتي من الشكل لا المضمون — بدّل الخلفية والصياغة ونقطة البدء أسبوعيًا."],
    ["ما أفضل وقت فعليًا للنشر؟", "بعد الفجر تقليديًّا للكهف، والخميس مساءً للتمهيد؛ راقب «أوقات نشاط متابعيك» في أول أسبوعين ثم جمّد القرار."],
    ["هل أنشر كل الجمعات بلا استثناء؟", "انشر على الأقل في الجمعة الفارغة من الشهر — الانتظام أهم من الكمال؛ والدفعة المجدولة تضمن ذلك."],
    ["هل يناسب المحتوى الأسبوعي غير المسلمين؟", "الآيات القصيرة المطلقة (النور، الدعاء) تعبر لغويًّا؛ ويمكنك تفعيل الترجمة داخل الفيديو من تبويب الترجمة لتوسيع الوصول إلى جمهور لا ينطق العربية."],
  ],
  links: [
    ["/blog/schedule-quran-reels/", "الجدولة"],
    ["/blog/ramadan-content-plan/", "خطة رمضان"],
    ["/ar/short-quran-verses-video/", "أقصر الآيات"],
    ["/", "المولّد"]
  ]
},
{
  slug: "first-quran-video-tutorial",
  cardTitle: "أول فيديو في5 دقائق",
  cardDesc: "دليل المبتدئين خطوة بخطوة — بلا خبرة وبلا جوال بحاجة لبرنامج.",
  title: "كيف تصنع أول فيديو قرآن لك في 5 دقائق — دليل المبتدئين | مدونة قرآن ريلز",
  desc: "دليل صفر للمبتدئين: افتح المولّد، اختر السورة والآيات والقارئ والخلفية، شاهد المعاينة، صدّر MP4 عموديًا1080×1920 — بدون خبرة وبدون تثبيت برامج.",
  keywords: "كيف اصنع فيديو قرآن, دليل صانع فيديو قرآن, أول فيديو قرآن للمبتدئين, صفر خبرة",
  h1: "كيف تصنع أول فيديو قرآن لك في 5 دقائق",
  h1short: "دليل المبتدئين: أول فيديو",
  read: "٥",
  lead: "لا خبرة مونتاج، لا تثبيت برامج، لا حساب: تحتاج متصفحًا وخمس دقائق. هذا الدليل يمشي معك خطوة بخطوة بالأسماء الحقيقية لكل زر في المولّد.",
  cta: [{ t: "🎬 ابدأ أول فيديو", h: "/#/" }, { t: "أخطاء تتجنّبها", h: "/blog/mistakes-quran-shorts/" }],
  body: `
  <section class="lp-sec">
    <h2>قبل أن تبدأ (30 ثانية)</h2>
    <ul>
      <li>افتح <a href="/" style="color:var(--gold-3)">quran-reels-tau.vercel.app</a> في متصفح حديث (جوال أو حاسب).</li>
      <li>لا تسجّل ولا ترفع شيئًا — كل المعالجة داخل جهازك.</li>
      <li>جهّز فكرة واحدة: آية تحبّها (لو محتار افتح <a href="/blog/quran-video-ideas/" style="color:var(--gold-3)">قائمة الأفكار30</a>).</li>
    </ul>
  </section>
  <section class="lp-sec">
    <h2>الخطوات الست</h2>
    <div class="feat">
      <div><b>1 · السورة والآيات</b>في تبويب «السورة والآيات» اختر السورة ثم آية البداية والنهاية (من1 إلى30 آية).</div>
      <div><b>2 · القارئ</b>تبويب «القارئ»:47 صوتًا مع معاينة فورية — اسمع واحدين واختر راحتك.</div>
      <div><b>3 · الخلفية</b>تبويب «الخلفية»: اختر14 خلفية جاهزة أو ارفع صورتك (تبقى محلية).</div>
      <div><b>4 · الترجمة (اختياري)</b>تبويب «الترجمة»: اختر10 من8 لغات إن أردت معنى الآية داخل المشهد.</div>
      <div><b>5 · المعاينة</b>اضغط ▶ — راقب النص على الشاشة الرأسية وتأكد أنه واضح بوضوح تام.</div>
      <div><b>6 · إنشاء</b>زر «إنشاء» ← شريط التقدّم ← تحميل MP41080×1920 (أو شاركه من نفس النافذة).</div>
    </div>
    <p>إن أخطأت في أي اختيار غيّره قبل الإنشاء فقط — لا شيء يُرفع ولا شيء يُخزَّن، فالتجرّب بلا كلفة.</p>
  </section>
  <section class="lp-sec">
    <h2>بعد التصدير:3 خطوات</h2>
    <ol>
      <li><b>راجع الملف</b>على جوالك: الصوت كامل حتى آخر ثانية؟ النص مقروء في الظل والشمس؟</li>
      <li><b>اكتب الوصف</b>: جملة واحدة + «[السورة · الآية n]» +2-3 وسوم.</li>
      <li><b>انشر مباشرة</b>أو <a href="/blog/schedule-quran-reels/" style="color:var(--gold-3)">جدوله</a> ليصلك لاحقًا (يتطلب حسابًا اختياريًّا).</li>
    </ol>
    <div class="callout"><b>أول مقطع مثالي:</b> سورة الكوثر أو العصر (3 آيات) + قارئ واضح + خلفية داكنة + بلا ترجمة. البساطة في المرة الأولى تبني عادة الاستمرار.</div>
  </section>
  <section class="lp-sec">
    <h2>أسئلة أول يوم</h2>
    <p>«هل يمكن من الجوال؟» نعم، نفس الخطوات. «هل يبطئ الجهاز؟» التصدير يعمل على متصفحك بتسريع الرسوم؛ أغلب الأجهزة الحديثة تنهي30 ثانية في أقل من دقيقة. «وقت المقاس؟» الافتراضي1080×1920 عمودي9:16 هو ما تريده لتيك توك وشورتس وحالات واتساب. والتفاصيل والأخطاء الشائعة في <a href="/blog/mistakes-quran-shorts/" style="color:var(--gold-3)">مقال الأخطاء السبعة</a>.</p>
  </section>`,
  faq: [
    ["هل أحتاج خبرة في المونتاج؟", "لا إطلاقًا — أربع اختيارات فقط والباقي جاهز؛ إن استطعت اختيار قائمة في هاتفك تستطيع صناعة المقطع."],
    ["هل يعمل على الجوال فعلًا؟", "نعم — نفس التجربة على أندرويد وآيفون دون تثبيت أي تطبيق، ولديه زر تثبيت كتطبيق إن أحببت."],
    ["ماذا لو أخطأت في الآية؟", "عدّل السورة أو النطاق قبل زر الإنشاء؛ لا يوجد حفظ إجباري ولا ملفات تُرسل فيتغيّر كل شيء فورًا."],
    ["هل أستطيع إضافة ترجمة لاحقًا؟", "الترجمة تُضاف وقت التصميم قبل الإنشاء — أعد الإنشاء بثوانٍ إن غيّرت رأيك؛ الملفات بجودة كاملة في كل مرة."]
  ],
  links: [
    ["/ar/quran-video-maker/", "صفحة الصانع"],
    ["/blog/mistakes-quran-shorts/", "الأخطاء السبعة"],
    ["/blog/quran-video-ideas/", "أفكار جاهزة"],
    ["/en/quran-video-maker/", "English guide"]
  ]
}
];

/* ============================= التوليد ============================= */
const outDir = path.join(__dirname, "..", "public", "blog");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "index.html"), hubPage(ARTICLES));
console.log("wrote blog/index.html", fs.statSync(path.join(outDir, "index.html")).size, "bytes");
for (const a of ARTICLES) {
  const d = path.join(outDir, a.slug);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, "index.html"), articlePage(a));
  console.log("wrote blog/" + a.slug, fs.statSync(path.join(d, "index.html")).size, "bytes");
}
console.log("blog done:", ARTICLES.length, "articles + hub");

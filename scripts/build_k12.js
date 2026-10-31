/* كمل#12 — دفعة «كلهم»: صفحات /en/ الإنجليزية + صفحات الثقة + فهرس وصفحات القرّاء الـ47.
 * الاستخدام: node scripts/build_k12.js
 * يكتب: public/en/<slug>/ · public/{about,terms,privacy,contact}/ · public/ar/reciters/ + public/ar/reciter/<slug>/ */
const { hdrNav } = require("./site_nav.js");
const fs = require("fs");
const path = require("path");

const ORIGIN = "https://quran-reels-tau.vercel.app";
const VERIF = "IHmoe5QFrC77PbZdh2O0MeZFLIKwg-saA50td32AcQo";
const ICON = "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2064%2064'%3E%3Crect%20width='64'%20height='64'%20rx='16'%20fill='%23050f0c'/%3E%3Cpath%20d='M44%2014a20%2020%200%201%200%206%2026A16%2016%200%201%201%2044%2014z'%20fill='%23e6c46a'/%3E%3Ccircle%20cx='46'%20cy='22'%20r='3'%20fill='%23e6c46a'/%3E%3C/svg%3E";

const STYLE = `
  .lp-hero{padding:54px 0 26px;text-align:center}
  .lp-hero h1{font-size:clamp(1.7rem,4.4vw,2.6rem);font-weight:900;margin-bottom:12px}
  .lp-hero p.lead{max-width:760px;margin:0 auto 20px;color:var(--muted);font-size:1.03rem;line-height:1.95}
  .lp-cta{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px}
  .lp-sec{max-width:840px;margin:26px auto}
  .lp-sec h2{font-size:1.3rem;font-weight:800;margin:26px 0 10px;color:var(--gold-3)}
  .lp-sec h3{font-size:1.05rem;font-weight:700;margin:18px 0 8px;color:var(--gold-3)}
  .lp-sec p,.lp-sec li{line-height:2.05;color:var(--muted);font-size:.97rem}
  .lp-sec ul{padding-right:20px}
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
  .rc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:10px;margin:16px 0}
  .rc-card{display:block;background:var(--panel);border:1px solid var(--line-2);border-radius:12px;padding:12px 14px;color:var(--muted);text-decoration:none;font-size:.9rem;line-height:1.7}
  .rc-card:hover{border-color:var(--gold-3)}
  .rc-card b{display:block;color:var(--gold-3);font-size:.97rem}
  .rc-card i{font-style:normal;font-size:.78rem;opacity:.75}
  .form{max-width:580px;margin:20px auto;background:var(--panel);border:1px solid var(--line-2);border-radius:14px;padding:18px 20px;text-align:right}
  .form label{display:block;margin:12px 0 4px;color:var(--gold-3);font-weight:700;font-size:.9rem}
  .form input,.form textarea{width:100%;padding:9px 12px;border-radius:8px;border:1px solid var(--line-2);background:rgba(0,0,0,.25);color:#eaf3ee;font:inherit}
  .form textarea{min-height:130px;resize:vertical}
  .form .btn{margin-top:14px;width:100%}
  .hp{position:absolute;left:-9999px}
  #formMsg{margin-top:10px;font-size:.9rem;color:var(--gold-3);min-height:1.2em}
  html[dir=ltr] .tbl th,html[dir=ltr] .tbl td{text-align:left}
  html[dir=ltr] .lp-sec ul{padding-left:20px;padding-right:0}
`;

/* ============================= القرّاء الـ47 ============================= */
const src = fs.readFileSync(path.join(__dirname, "..", "public", "js", "data.js"), "utf8");
const mRec = src.match(/const RECITERS = (\[[\s\S]*?\n\]);/);
if (!mRec) { console.error("RECITERS not found"); process.exit(1); }
const REC = eval(mRec[1]); // مصفوفة بيانات الموقع نفسها — لا نسخة ثابتة
REC.forEach(r => { r.folder = r.n2 || r.id; });

const slugify = id => id
  .replace(/%20/g, "_")
  .split(/[_\s]+/)
  .filter(t => t && !/^\d+kbps$/i.test(t) && !/quranexplorer\.com/i.test(t))
  .join("-")
  .replace(/(\d+)(kbps)/ig, "")
  .toLowerCase()
  .replace(/[^a-z0-9-]+/g, "-")
  .replace(/-+/g, "-")
  .replace(/^-|-$/g, "");

const FACTS = {
  "Alafasy_128kbps": "الكويتي مشاري راشد العفاسي — إمام وقارئ عالميًا، تُبث تلاواته على ملايين المشاهدين، وهو من أكثر الأصوات اختيارًا في مقاطع التيك توك والشورتس قربًا.",
  "Abdul_Basit_Murattal_192kbps": "الشيخ عبدالباسط عبدالصمد — من أشهر قراء العالم على الإطلاق، وصوته المرتل من أكثر الأصوات تداولًا في المقاطع المؤثرة.",
  "Abdul_Basit_Mujawwad_128kbps": "نفس الصوت الذهبي لعبدالباسط بأسلوب المجوّد الممتلئ بالتعاليل والأداءات المتباعدة — لقطات لا تُنسى.",
  "Abdurrahmaan_As-Sudais_192kbps": "الشيخ عبدالرحمن السديس — إمام وخطيب الحرم المكي، وتلاوته من أكثر التلاوات صدى في مواسم رمضان والحج.",
  "Saood_ash-Shuraym_128kbps": "الشيخ سعود الشريم — إمام الحرم المكي، بتلاوة رصينة تليق بصحن الطواف.",
  "MaherAlMuaiqly128kbps": "الشيخ ماهر المعيقلي — إمام الحرم المكي، بصوت واضح مريح يفضّله الكثيرون في المقاطع الطويلة والقصيرة.",
  "Husary_128kbps": "الشيخ محمود خليل الحصري — من أوائل من نشروا التلاوة المرتلة المسموعة، وصوته المجرّد من الغناء المرجّح مرجع لطلبة التحفيظ.",
  "Minshawy_Murattal_128kbps": "الشيخ محمد صديق المنشاوي — صوت مصر الذهبي في المرتل، رقيق المخارج، وأكثر تلاواته المسموعة على الإطلاق.",
  "Hudhaify_128kbps": "الشيخ عبد الله الحذيفي — من أئمة المسجد النبوي الشريف، بتلاوة هادئة صافية يحبها المصلون.",
  "Salah_Al_Budair_128kbps": "الشيخ صلاح البدير — إمام المسجد النبوي الشريف، أداء مجود أنيق.",
  "Mustafa_Ismail_48kbps": "الشيخ مصطفى إسماعيل — أستاذ التلاوة والقراء، صاحب المجرى الخاص الذي جعله من أعظم الأصوات تأثيرًا في جيله.",
  "Abu_Bakr_Ash-Shaatree_128kbps": "الشيخ أبو بكر الشاطري — النيجيري صاحب الأداء العالي المعبّر، من أشهر الأصوات في أفريقيا وخارجها.",
  "Hani_Rifai_192kbps": "الشيخ هاني الرفاعي — بصوت عذب ورنّان يناسب المقاطع التحفيزية."
};

function reciterFacts(r, short) {
  if (FACTS[r.id]) return FACTS[r.id];
  const tag = r.tag || "";
  if (tag === "الحرم المكي") return `من أئمة الحرم المكي الشريف — ${short} بتلاوة رصينة من أحضان البيت الحرام، تناسب مقاطع الطواف والهداية.`;
  if (tag === "الحرم المديني") return `من أئمة المسجد النبوي الشريف — ${short} بتلاوة هادئة تليق بمقام المدينة المنورة.`;
  if (tag === "مجوّد") return `${short} بأسلوب المجوّد: صوت ممتلئ بالتعاليل والحركات، يمنح المقطع رهبة ووقارًا.`;
  if (tag === "مرتل") return `${short} بأسلوب المرتل: إمساك واضح بالحروف وهدوء يثبت القارئ والمتابع معًا.`;
  if (tag === "تعليمي") return `${short} بالأسلوب التعليمي الممهل — ممتاز لمقاطع التحفيظ وتعلّم النطق.`;
  if (tag === "قراءة عالية") return `${short} بأداء عالٍ معبّر يناسب اللحظات القوية في المقاطع.`;
  if (tag === "جودة عالية") return `${short} بصوت واضح بجودة عالية — خيار موثوق للفيديوهات الطويلة والقصيرة.`;
  if (tag === "الأكثر استماعًا") return `${short} — من أكثر الأصوات استماعًا في مكتبتنا.`;
  return `${short} — قارئ متقن من مكتبة قرآن ريلز، تلاوته برواية حفص عن عاصم والنص العثماني داخل الفيديو.`;
}

const shortOf = n => n.replace(/^الشيخ\s+/, "");

/* ============================= قالب الصفحة ============================= */
function page(o) {
  const L = o.lang || "ar";
  const dir = o.dir || (L === "ar" ? "rtl" : "ltr");
  const loc = ORIGIN + o.path;
  const href = o.hreflang ? o.hreflang + "\n" : "";
  const extraLd = o.extraLd ? `\n<script type="application/ld+json">\n${o.extraLd}\n</script>` : "";
  const script = o.script ? `\n<script>\n${o.script}\n</script>` : "";
  const brand = L === "ar"
    ? `<span>قرآن ريلز<small>صانع فيديو قرآن مجاني</small></span>`
    : `<span>Quran Reels<small>Free Quran video maker</small></span>`;
  const topbar = L === "ar"
    ? `☽ صدقة جارية على نبيّنا محمد ﷺ · الموقع مجاني 100%`
    : `100% free · no watermarks · no daily limits · a voluntary project`;
  const foot = L === "ar"
    ? `<span>© 2026 قرآن ريلز — <a href="/" style="color:var(--gold-3)">الرئيسية</a> · <a href="/ar/quran-video-maker/" style="color:var(--gold-3)">صانع الفيديو</a> · <a href="/ar/reciters/" style="color:var(--gold-3)">القرّاء</a> · <a href="/blog/" style="color:var(--gold-3)">مقالات</a> · <a href="/ar/islamic-tools/" style="color:var(--gold-3)">الأدوات</a> · <a href="/about/" style="color:var(--gold-3)">عنّا</a> · <a href="/contact/" style="color:var(--gold-3)">تواصل</a> · <a href="/terms/" style="color:var(--gold-3)">شروط</a> · <a href="/privacy/" style="color:var(--gold-3)">خصوصية</a></span>`
    : `<span>© 2026 Quran Reels — <a href="/" style="color:var(--gold-3)">App</a> · <a href="/en/quran-video-maker/" style="color:var(--gold-3)">Video maker</a> · <a href=\"/en/tools/\" style=\"color:var(--gold-3)\">Tools</a> · <a href="/ar/reciters/" style="color:var(--gold-3)">Reciters</a> · <a href="/blog/" style="color:var(--gold-3)">Blog</a> · <a href="/about/" style="color:var(--gold-3)">About</a> · <a href="/privacy/" style="color:var(--gold-3)">Privacy</a> · <a href="/contact/" style="color:var(--gold-3)">Contact</a></span>`;
  const ogsite = L === "ar" ? "قرآن ريلز" : "Quran Reels";
  return `<!DOCTYPE html>
<html lang="${L}" dir="${dir}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${o.title}</title>
<meta name="description" content="${o.desc}">
<meta name="keywords" content="${o.keywords || ""}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${loc}">
${href}<meta name="google-site-verification" content="${VERIF}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${ogsite}">
<meta property="og:locale" content="${L === "ar" ? "ar_AR" : "en_US"}">
<meta property="og:title" content="${o.title}">
<meta property="og:description" content="${o.desc}">
<meta property="og:url" content="${loc}">
<meta property="og:image" content="${ORIGIN}/img/og-cover.jpg?v=2">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${o.title}">
<meta name="twitter:description" content="${o.desc}">
<meta name="twitter:image" content="${ORIGIN}/img/og-cover.jpg?v=2">
<meta name="theme-color" content="#050f0c">
<link rel="icon" href="${ICON}">
<link rel="apple-touch-icon" href="/img/icon-192.png?v=2">
<link rel="stylesheet" href="/css/style.css?v=3">
<style>${STYLE}</style>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"${o.ldType || "WebPage"}","name":${JSON.stringify(o.title)},"url":"${loc}","inLanguage":"${L}","description":${JSON.stringify(o.desc)},"isPartOf":{"@type":"WebSite","name":"${ogsite}","url":"${ORIGIN}/"}}
</script>${o.faq && o.faq.length ? `
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
${o.faq.map(([q, a]) => `{"@type":"Question","name":${JSON.stringify(q)},"acceptedAnswer":{"@type":"Answer","text":${JSON.stringify(a)}}}`).join(",\n")}
]}
</script>` : ""}${extraLd}
</head>
<body>
<div class="topbar">${topbar}</div>
<header class="site-header">
  <div class="container header-in">
    <a class="brand" href="/">
      <span class="brand-logo"><svg viewBox="0 0 64 64" fill="none"><path d="M46 10a22 22 0 1 0 7 30A17.5 17.5 0 1 1 46 10z" fill="#1d1403"/><circle cx="49" cy="19" r="3.4" fill="#1d1403"/></svg></span>
      ${brand}
    </a>
    ${hdrNav(L)}
    <a class="btn btn-em" href="${o.cta[0].h}">${o.cta[0].t}</a>
  </div>
</header>
<main class="container">
  <section class="lp-hero">
    <h1>${o.h1}</h1>
    <p class="lead">${o.lead}</p>
    <div class="lp-cta">${o.cta.map(c => `<a class="btn btn-em" href="${c.h}">${c.t}</a>`).join("")}</div>
    ${o.badges && o.badges.length ? `<div class="lp-cta" style="margin-top:14px">${o.badges.map(b => `<span class="count-badge">${b}</span>`).join("")}</div>` : ""}
  </section>
${o.body}
${o.faq && o.faq.length ? `  <section class="lp-sec">
    <h2>${L === "ar" ? "الأسئلة الشائعة" : "Frequently asked questions"}</h2>
    ${o.faq.map(([q, a]) => `<div class="qa"><h3>${q}</h3><p>${a}</p></div>`).join("\n    ")}
  </section>` : ""}
  <div class="lp-links">
    ${(o.links || []).map(([h, t]) => `<a href="${h}">${t}</a>`).join("\n    ")}
  </div>
</main>
<footer class="footer" style="margin-top:30px">
  <div class="container foot-bottom">
    ${foot}
    <span>${L === "ar" ? "﴿ إِنَّ اللَّهَ مَعَ الصَّابِرِينَ ﴾" : "“Indeed, Allah is with the patient.”"}</span>
  </div>
</footer>
${script}
</body>
</html>
`;
}

const write = (p, html) => {
  const abs = path.join(__dirname, "..", "public", p);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, html);
  console.log("wrote", p, fs.statSync(abs).size, "bytes");
};

const alt = (o) => { // hreflang لصفحة مقترنة
  let s = `<link rel="alternate" hreflang="x-default" href="${ORIGIN}/">`;
  s += `\n<link rel="alternate" hreflang="ar" href="${ORIGIN}${o.ar}">`;
  s += `\n<link rel="alternate" hreflang="en" href="${ORIGIN}${o.en}">`;
  return s;
};

/* ============================= 1) صفحات /en/ ============================= */
const EN = [
{
  path: "/en/",
  pair: { ar: "/", en: "/en/" },
  title: "Quran Video Maker — Free Reels, Shorts & Status Videos | Quran Reels",
  desc: "Turn any Quran verse into a vertical 9:16 video in your browser: 47 reciters, Uthmani script, 8 translation languages, 14 backgrounds. Live preview, MP4 1080×1920, no watermark, no daily limits, no account.",
  keywords: "quran video maker, quran reels, make quran video, quran shorts, quran status video",
  h1: "Make Quran Videos Online — Reels, Shorts & Status in Seconds",
  lead: "Quran Reels is a free, browser-based Quran video maker. Pick a surah, a reciter and a background, then export a vertical MP4 ready for TikTok, Instagram Reels, YouTube Shorts, WhatsApp status or your website. Everything runs on your device — no uploads, no queue, no watermark.",
  cta: [{ t: "🎬 Create your Quran video", h: "/#/" }, { t: "🕌 Prayer times & Qibla", h: "/en/prayer-times/" }],
  badges: ["Free · no limits", "47 reciters", "1080×1920 MP4", "No account needed"],
  body: `
  <section class="lp-sec">
    <h2>What you can create</h2>
    <div class="feat">
      <div><b>Reels &amp; Shorts</b>15–60 second clips of one complete verse — the format short platforms reward most.</div>
      <div><b>WhatsApp status</b>A clean vertical clip of a short surah, exported and shared in minutes.</div>
      <div><b>Dawah with translation</b>Arabic recitation with the meaning shown inside the video in 8 languages.</div>
      <div><b>Memorization loops</b>Repeat a verse or range with a clear Uthmani text on screen.</div>
      <div><b>Recitation backgrounds</b>14 calm backdrops — mosques, skies, night skies, gradients — that never fight the text.</div>
      <div><b>Scheduled publishing</b>Optional free account: schedule your export straight to YouTube.</div>
    </div>
  </section>
  <section class="lp-sec">
    <h2>How it works — four choices, thirty seconds</h2>
    <div class="feat">
      <div><b>1 · Surah &amp; verses</b>Choose any of the 114 surahs and a range of up to 30 ayahs.</div>
      <div><b>2 · Reciter</b>47 world-class reciters with instant per-ayah audio preview.</div>
      <div><b>3 · Background &amp; translation</b>14 backdrops or your own image, plus optional translation captions.</div>
      <div><b>4 · Preview &amp; export</b>Watch it live, then export a 1080×1920 MP4 saved straight to your device.</div>
    </div>
    <p>No file uploads, no render queue, no sign-up. The whole pipeline runs inside your browser — which is why it is instant even when you export ten videos in a row.</p>
  </section>
  <section class="lp-sec">
    <h2>Why is it free?</h2>
    <table class="tbl">
      <tr><th></th><th>Quran Reels</th><th>Typical cloud tools</th></tr>
      <tr><td>Price</td><td><b>Free, no credits</b></td><td>Free trials, then paid credits</td></tr>
      <tr><td>Daily limit</td><td><b>Unlimited</b></td><td>Often 3–10 videos per day</td></tr>
      <tr><td>Watermark</td><td><b>None</b></td><td>Often on the free plan</td></tr>
      <tr><td>Account</td><td><b>Not required</b></td><td>Usually required upfront</td></tr>
      <tr><td>Uploads</td><td><b>Nothing leaves your device</b></td><td>Files sent to their servers</td></tr>
    </table>
    <p>The project is run as voluntary charity: no ads, no trackers, no selling data. The optional account exists only if you want automated YouTube scheduling.</p>
  </section>
  <section class="lp-sec">
    <h2>Beyond video — 32 Islamic tools, one tab</h2>
    <p>Prayer times with 13 calculation methods, a Qibla compass, Hijri date, morning and evening adhkar counter, digital tasbeeh, a zakat calculator and more — plus a public <b>MCP endpoint</b> so AI assistants can call the site directly. It all works offline after the first visit as an installable app.</p>
  </section>`,
  faq: [
    ["Is Quran Reels really free?", "Yes — unlimited exports, no watermark, no credits and no account required. The project is voluntary charity with no ads or trackers."],
    ["Does it work on my phone?", "Yes. It runs in any modern mobile or desktop browser — Android, iPhone, Windows, macOS — with no app to install. You can also install it as an offline app."],
    ["How many reciters and translations are included?", "47 reciters, the full 114 surahs in Uthmani script (Hafs), 8 translation languages and 14 backgrounds."],
    ["Do I own the videos I create?", "Yes — your exports are yours to publish anywhere. See our terms of use for the full policy."]
  ],
  links: [
    ["/en/quran-video-maker/", "Quran video maker"],
    ["/en/quran-video-tiktok/", "Quran videos for TikTok"],
    ["/en/quran-video-with-translation/", "Translation inside the video"],
    ["/en/prayer-times/", "Prayer times"],
    ["/en/qibla-direction/", "Qibla direction"],
    ["/", "Open the app"]
  ]
},
{
  path: "/en/quran-video-maker/",
  pair: { ar: "/ar/quran-video-maker/", en: "/en/quran-video-maker/" },
  title: "Quran Reels Maker & Video Maker — Free 9:16 Ayah Videos Online | Quran Reels",
  desc: "Free online Quran reels maker & video maker: turn any ayah into a 1080×1920 vertical video with Uthmani text, 47 reciters, backgrounds and translation. Live preview, instant MP4 export, no watermark.",
  keywords: "quran video maker, quran reels maker, quran reels app, quran ayah video, vertical quran video, quran video editor online free",
  h1: "Quran Reels Maker — Turn Any Ayah into a Vertical Video",
  lead: "A dedicated Quran video maker, not a general editor: the Uthmani text is typeset for 9:16, the recitation is synced per ayah, and the export is a clean 1080×1920 MP4 — all in your browser, all free.",
  cta: [{ t: "🎬 Open the maker", h: "/#/" }, { t: "💡 Short-verse ideas", h: "/en/quran-video-tiktok/" }],
  badges: ["9:16 vertical", "1080×1920 MP4", "Live preview", "No watermark"],
  body: `
  <section class="lp-sec">
    <h2>Built for the Quran, not retrofitted</h2>
    <ul>
      <li><b>Uthmani script, Hafs</b> — full diacritics rendered large and legible on a phone screen.</li>
      <li><b>Per-ayah timing</b> — audio, text highlight and translation follow the reciter exactly.</li>
      <li><b>Range selection</b> — one powerful ayah or up to 30 ayahs for a longer reflection.</li>
      <li><b>Translation overlay</b> — optional meaning line inside the video in 8 languages.</li>
      <li><b>Your own image</b> — use one of 14 backdrops or upload a personal photo as background.</li>
    </ul>
  </section>
  <section class="lp-sec">
    <h2>Export formats that platforms accept</h2>
    <p>The exporter produces <b>MP4 (H.264)</b> and <b>WebM</b> at <b>1080×1920</b> — the exact vertical format TikTok, Reels, Shorts and WhatsApp status expect. The file is written directly to your device; there is no server round-trip and no waiting line, even at 1080p.</p>
  </section>
  <section class="lp-sec">
    <h2>Quran Reels vs general video editors</h2>
    <table class="tbl">
      <tr><th></th><th>Quran Reels</th><th>General editors</th></tr>
      <tr><td>Setup per clip</td><td><b>Four choices</b></td><td>Timeline, fonts, audio tracks</td></tr>
      <tr><td>Quran text</td><td><b>Uthmani, pre-typeset</b></td><td>You source and format it</td></tr>
      <tr><td>Recitation sync</td><td><b>Automatic per ayah</b></td><td>Manual cutting</td></tr>
      <tr><td>Time per video</td><td><b>Under a minute</b></td><td>Tens of minutes</td></tr>
      <tr><td>Cost</td><td><b>Free, unlimited</b></td><td>Subscription or installed software</td></tr>
    </table>
  </section>
  <section class="lp-sec">
    <h2>Publishing tips</h2>
    <ul>
      <li><b>First three seconds</b> — open on the strongest phrase of the ayah, no cold intro.</li>
      <li><b>15–60 seconds</b> — one complete thought beats a cut-off half verse.</li>
      <li><b>Name the surah</b> in the caption so viewers can find the full context.</li>
      <li><b>Be consistent</b> — one clip daily outperforms five clips once a week.</li>
    </ul>
  </section>`,
  faq: [
    ["Can I choose how many ayahs to include?", "Yes — from a single ayah up to 30 consecutive ayahs, with the exact range you pick."],
    ["Is the text the Uthmani script?", "Yes — Uthmani script with full vowel marks (Hafs), rendered specifically for vertical video."],
    ["Do I need to install anything?", "No — the maker runs entirely in the browser and exports directly to your device."],
    ["Can I use the videos commercially?", "Your exports are yours; see the terms of use for details."]
  ],
  links: [
    ["/", "Open the app"],
    ["/en/quran-video-tiktok/", "Quran TikTok videos"],
    ["/en/quran-video-with-translation/", "Translation videos"],
    ["/ar/reciters/", "All 47 reciters"]
  ]
},
{
  path: "/en/quran-video-with-translation/",
  pair: { ar: "/ar/quran-video-with-translation/", en: "/en/quran-video-with-translation/" },
  title: "Quran Video with Translation — 8 Languages Inside the Video | Quran Reels",
  desc: "Make Quran videos with the meaning shown inside the frame: English, French, Turkish, Indonesian, Urdu, Spanish, Italian and simplified Arabic — while the recitation stays original. Free export.",
  keywords: "quran video with translation, quran video english translation, translated quran video maker",
  h1: "Quran Videos with Translation — the Meaning Inside the Frame",
  lead: "Arabic recitation stays untouched while a clean subtitle line of the meaning appears under the Uthmani text — the shortest path to reaching viewers who don't speak Arabic, in a single video.",
  cta: [{ t: "🌍 Try it now", h: "/#/" }, { t: "🎬 Video maker", h: "/en/quran-video-maker/" }],
  badges: ["8 languages", "Recitation stays Arabic", "Inside the video", "Free"],
  body: `
  <section class="lp-sec">
    <h2>Languages available inside the video</h2>
    <div class="feat">
      <div><b>English</b> — the widest global reach.</div>
      <div><b>French</b> — North &amp; West Africa and the Francophone world.</div>
      <div><b>Turkish</b></div>
      <div><b>Indonesian</b> — the largest Muslim population on earth.</div>
      <div><b>Urdu</b> — the Indian subcontinent.</div>
      <div><b>Spanish</b></div>
      <div><b>Italian</b></div>
      <div><b>Simplified Arabic</b> — for Arabic speakers outside a religious context.</div>
    </div>
  </section>
  <section class="lp-sec">
    <h2>Why this beats platform auto-captions</h2>
    <p>Auto-captions transcribe human speech and routinely corrupt the wording of the Qur'an. Here the line is bound to the ayah reference itself (surah and number), so what appears on screen matches the intended text — and it is ready before upload, with no waiting for a platform to process your file.</p>
    <h3>Good uses</h3>
    <ul>
      <li><b>Dawah to non-Arabic speakers</b> — meaning and voice in one clip.</li>
      <li><b>Mixed audiences</b> — Indonesian, Pakistani and European followers in one feed.</li>
      <li><b>Teaching</b> — tafsir and lessons with the meaning anchored on screen.</li>
      <li><b>Family status videos</b> — relatives who don't read Arabic still receive the meaning.</li>
    </ul>
  </section>`,
  faq: [
    ["Does the recitation change when translation is on?", "No — the voice stays the original Arabic recitation; the translation is only a text line inside the frame."],
    ["Is translation mandatory?", "No — it is optional and can be switched off or changed language at any time."],
    ["What if my language is missing?", "The eight languages cover most of the global audience; more can be added on request."],
    ["Does the translation change the video size?", "No — it is composed into the same 1080×1920 layout."]
  ],
  links: [
    ["/", "Open the app"],
    ["/en/quran-video-maker/", "Quran video maker"],
    ["/en/quran-video-tiktok/", "Quran TikTok videos"],
    ["/ar/quran-video-with-translation/", "النسخة العربية"]
  ]
},
{
  path: "/en/quran-video-tiktok/",
  pair: { ar: "/ar/quran-video-tiktok/", en: "/en/quran-video-tiktok/" },
  title: "Quran Videos for TikTok, Reels & YouTube Shorts — Free Maker | Quran Reels",
  desc: "Make Quran videos for TikTok, Instagram Reels and YouTube Shorts: vertical 9:16, 15–60 seconds, Uthmani text, 47 reciters, short-verse ideas — export free with no watermark.",
  keywords: "quran video tiktok, quran reels instagram, quran youtube shorts, islamic shorts maker",
  h1: "Quran Videos for TikTok, Reels & Shorts",
  lead: "Short-form platforms reward clips that hold attention from the first second. Quran Reels turns a complete, meaningful ayah into a 9:16 video with clear Uthmani text and balanced recitation — ready to post without any editor.",
  cta: [{ t: "🎬 Make your first clip", h: "/#/" }, { t: "📖 Short surahs to start with", h: "/en/quran-video-maker/" }],
  badges: ["9:16 for TikTok · Reels · Shorts", "15–60 s sweet spot", "No watermark", "Unlimited"],
  body: `
  <section class="lp-sec">
    <h2>Why Quran clips spread</h2>
    <p>Algorithms favour content that grips the viewer in the first moment: a striking recitation, one complete ayah, and a background that doesn't compete with the text. A single-verse clip can reach hundreds of thousands of views with zero ad spend — and the winning strategy is <b>steady publishing</b>, not heavy editing.</p>
    <h3>Rules that work for Islamic short clips</h3>
    <ul>
      <li><b>First 3 seconds</b> — open on the heart of the ayah; no intro screen.</li>
      <li><b>15–60 seconds</b> — the range short platforms push most.</li>
      <li><b>One complete meaning</b> — never cut an ayah away from its context.</li>
      <li><b>Readable text</b> — large type, high contrast, nothing stacked on the letters.</li>
      <li><b>Caption properly</b> — short description plus the surah name and number.</li>
    </ul>
  </section>
  <section class="lp-sec">
    <h2>Short surahs that perform well</h2>
    <p><b>Al-Kawthar</b> (3 ayahs) · <b>Al-Asr</b> (3) · <b>An-Nasr</b> (3) · <b>Al-Ikhlas</b> (4) · <b>Quraysh</b> (4) · <b>Al-Falaq</b> (5) · <b>An-Nas</b> (6) · <b>Al-Kafirun</b> (6) · <b>Al-Masad</b> (7) · <b>Al-Maun</b> (7) — each is a self-contained message that fits a single short.</p>
  </section>
  <section class="lp-sec">
    <h2>Format checklist before you post</h2>
    <div class="feat">
      <div><b>1080×1920</b> — the vertical master every platform upscales from.</div>
      <div><b>No watermark</b> — our exports are clean, so no other app's logo rides along.</div>
      <div><b>Sound levels</b> — recitation is mastered for phone speakers.</div>
      <div><b>Loop-friendly</b> — a one-ayah clip invites a second watch, which boosts ranking.</div>
    </div>
  </section>`,
  faq: [
    ["What length works best for Islamic shorts?", "15–60 seconds with one complete ayah; up to 5 minutes if the content is a longer reflection."],
    ["Is the export really watermark-free?", "Yes — every export is clean at 1080×1920 with no logo on it."],
    ["Can I post the same clip to several platforms?", "Yes — export once and upload to TikTok, Reels, Shorts and WhatsApp status alike."],
    ["Do I need an account to export?", "No — the account is optional and only adds automated YouTube scheduling."]
  ],
  links: [
    ["/", "Open the app"],
    ["/en/quran-video-maker/", "Quran video maker"],
    ["/en/quran-video-with-translation/", "Translated clips"],
    ["/ar/short-quran-verses-video/", "قائمة الآيات القصيرة"]
  ]
},
{
  path: "/en/prayer-times/",
  pair: { ar: "/ar/prayer-times/", en: "/en/prayer-times/" },
  title: "Prayer Times Today — Accurate Schedule for Your Location | Quran Reels",
  desc: "Free prayer times calculator: Fajr to Isha for today at any coordinates or city, with 13 calculation methods (Umm al-Qura, Egyptian General Authority, MWL…), Asr school choice and automatic daylight-saving adjustment.",
  keywords: "prayer times, salah times today, prayer schedule near me, fajr maghrib isha times",
  h1: "Prayer Times for Today — Wherever You Are",
  lead: "Get today's Fajr, Sunrise, Dhuhr, Asr, Maghrib and Isha for any point on the map, computed in your device with 13 trusted calculation methods and automatic DST handling — free, offline-capable and without ads.",
  cta: [{ t: "🕌 Calculate prayer times", h: "/#/tool/prayer" }, { t: "🧭 Find the Qibla", h: "/en/qibla-direction/" }],
  badges: ["13 methods", "Automatic DST", "Works offline", "Free"],
  body: `
  <section class="lp-sec">
    <h2>What you get</h2>
    <div class="feat">
      <div><b>Today's six times</b>Fajr, sunrise, Dhuhr, Asr, Maghrib and Isha with the next prayer countdown.</div>
      <div><b>13 calculation methods</b>Umm al-Qura, Egyptian General Authority, Muslim World League, Karachi, ISNA, Dubai, Kuwait, Qatar, Singapore, Turkey, Tehran, Moonsighting and Morocco.</div>
      <div><b>Asr school</b>Standard (majority) or Hanafi, switchable instantly.</div>
      <div><b>Your location</b>Use GPS or type a city; manual coordinates also work.</div>
      <div><b>Automatic DST</b>Times follow daylight-saving changes without you touching anything.</div>
      <div><b>Offline</b>After the first visit the tool keeps working with no connection.</div>
    </div>
  </section>
  <section class="lp-sec">
    <h2>Which method should I pick?</h2>
    <ul>
      <li><b>Saudi Arabia / pilgrimage sites</b> — Umm al-Qura (Fajr 18.5°, Isha 90 min after Maghrib).</li>
      <li><b>Egypt, Libya, Syria, Iraq, Sudan…</b> — Egyptian General Authority (Fajr 19.5°, Isha 17.5°).</li>
      <li><b>Europe, North America, much of Africa</b> — Muslim World League (Fajr 18°, Isha 17°).</li>
      <li><b>India, Pakistan, Bangladesh</b> — University of Islamic Sciences, Karachi.</li>
      <li><b>When in doubt</b> — follow your local mosque's method; consistency with your community matters most.</li>
    </ul>
  </section>`,
  faq: [
    ["How accurate are these times?", "They follow the published formulas of each method with true solar position; your local mosque's slight variations (a minute or two) come from method choice, not arithmetic."],
    ["Do I need my location for them to work?", "The tool works with GPS, a typed city or manual coordinates — and remembers your choice on your device."],
    ["Does it adjust for daylight saving?", "Yes — timezone and DST are resolved automatically for the date you view."],
    ["Is there a notification or alarm?", "Yes — the in-app prayer alarm can remind you at each prayer time."]
  ],
  links: [
    ["/#/tool/prayer", "Open the calculator"],
    ["/en/qibla-direction/", "Qibla direction"],
    ["/ar/prayer-times/", "النسخة العربية"],
    ["/", "Quran video maker"]
  ]
},
{
  path: "/en/qibla-direction/",
  pair: { ar: "/ar/qibla-direction/", en: "/en/qibla-direction/" },
  title: "Qibla Direction & Distance — Compass from Anywhere | Quran Reels",
  desc: "Find the exact Qibla direction from your coordinates or city: bearing in degrees, distance to the Kaaba in km, and a live compass — free, offline-capable, no ads.",
  keywords: "qibla direction, qibla compass, which way is qibla, qibla distance kaaba",
  h1: "Which Way Is the Qibla? — Bearing & Distance from Your Location",
  lead: "Enter your city or use GPS to get the great-circle bearing to the Kaaba and the distance in kilometres, with a live compass overlay — computed on your device from the same coordinates your prayer times use.",
  cta: [{ t: "🧭 Open the compass", h: "/#/tool/qibla" }, { t: "🕌 Prayer times", h: "/en/prayer-times/" }],
  badges: ["Exact bearing", "Distance to Makkah", "Live compass", "Works offline"],
  body: `
  <section class="lp-sec">
    <h2>How the bearing is computed</h2>
    <p>The Qibla is the <b>great-circle path</b> from your position to the Kaaba (21.4225° N, 39.8262° E), not a flat-map line. The tool applies the standard initial-bearing formula to your coordinates, so results differ correctly between, for example, Cairo, London, Jakarta and New York.</p>
    <h3>Sample bearings</h3>
    <ul>
      <li><b>Cairo</b> ≈ 136° · <b>London</b> ≈ 119° · <b>Jakarta</b> ≈ 295° · <b>New York</b> ≈ 58° · <b>Dubai</b> ≈ 258°</li>
    </ul>
    <p>Hold the phone flat, align the on-screen arrow with the bearing shown, and the highlighted direction points to the Kaaba. Calibration tip: move your phone in a figure-eight if the compass drifts.</p>
  </section>
  <section class="lp-sec">
    <h2>Bearings and prayer times, together</h2>
    <p>The same location feeds both tools — set it once and the Qibla bearing, distance to Makkah and today's prayer schedule all update together. Everything works without an account and keeps working offline after the first visit.</p>
  </section>`,
  faq: [
    ["Does the Qibla change with my city?", "Yes — the bearing depends on your coordinates; the tool recomputes it for wherever you are."],
    ["Why does my mosque face a slightly different direction?", "Differences of one or two degrees come from rounding conventions or building alignment; the great-circle bearing here is the mathematical reference."],
    ["Does it work without internet?", "Yes — after the first load the compass works offline."],
    ["How is distance to Makkah calculated?", "By the Haversine great-circle distance from your coordinates to the Kaaba, shown in kilometres."]
  ],
  links: [
    ["/#/tool/qibla", "Open the compass"],
    ["/en/prayer-times/", "Prayer times"],
    ["/ar/qibla-direction/", "النسخة العربية"],
    ["/", "Quran video maker"]
  ]
}
];

for (const p of EN) {
  write(p.path.replace(/^\//, "") + "index.html", page({
    lang: "en", path: p.path, hreflang: alt(p.pair),
    title: p.title, desc: p.desc, keywords: p.keywords,
    h1: p.h1, lead: p.lead, cta: p.cta, badges: p.badges,
    body: p.body, faq: p.faq, links: p.links
  }));
}

/* ============================= 2) صفحات الثقة ============================= */
const TRUST = [
{
  path: "/about/",
  title: "من نحن — قرآن ريلز، مولّد فيديو قرآن كصدقة جارية | قرآن ريلز",
  desc: "تعرّف على قرآن ريلز: مشروع مجاني بالكامل يولّد فيديوهات قرآنية عمودية و32 أداة إسلامية بلا إعلانات ولا تتبّع — ومصادره من مصادر مفتوحة موثوقة، وموقع خادم MCP لمساعدات الذكاء.",
  keywords: "من نحن, عن قرآن ريلز, مولّد فيديو قرآن مجاني, موقع أدوات إسلامية",
  h1: "من نحن — قرآن ريلز",
  lead: "مشروع صدقة جارية يهدف إلى تبسيط صناعة المحتوى القرآني للجميع: أداة واحدة في المتصفح تصنع فيديو عموديًا كاملًا من أي آية، و32 أداة إسلامية يومية — بلا إعلانات ولا حساب ولا حدود.",
  cta: [{ t: "🎬 جرّب الموقع الآن", h: "/#/" }, { t: "✉️ تواصل معنا", h: "/contact/" }],
  badges: ["مجاني 100%", "بلا إعلانات", "بلا تتبّع", "صدقة جارية"],
  ldType: "AboutPage",
  body: `
  <section class="lp-sec">
    <h2>الفكرة في سطر</h2>
    <p>صناعة مقطع قرآني جميل كانت تحتاج برنامج مونتاج وساعات عمل. نحن اختصرنا ذلك إلى أربع اختيارات: السورة، القارئ، الخلفية، والتصدير — كل شيء يجري داخل متصفحك ولا يُرفع أي ملف إلى خادم. والباقي (الأدوات: مواقيت، قبلة، أذكار، زكاة…) مكملٌ لهذا الرائد اليومي.</p>
  </section>
  <section class="lp-sec">
    <h2>ما الذي نقدّمه؟</h2>
    <div class="feat">
      <div><b>مولّد فيديو قرآن</b>114 سورة بالنص العثماني (حفص)، 47 قارئًا، 8 لغات ترجمة، 14 خلفية، تصدير MP4 1080×1920 بلا علامة مائية.</div>
      <div><b>32 أداة إسلامية</b>مواقيت الصلاة بـ13 طريقة، قبلة، هجري، أذكار (132 نصًا)، مسبحة، زكاة، مواريث، كفارة، آية اليوم…</div>
      <div><b>أتمتة النشر</b>جدولة الفيديوهات إلى يوتيوب بحساب اختياري، وأتمتة يومي تلقائي.</div>
      <div><b>يعمل أوفلاين</b>تطبيق قابل للتثبيت (PWA) بعد أول فتح — يخدمك في الطيران.</div>
      <div><b>خادم MCP</b>نقطة استدعاء لمساعدات الذكاء (Claude وغيره) لتستدعي المواقيت والقبلة وصنع الريلز مباشرة.</div>
      <div><b>بلا حساب</b>التسجيل اختياري تمامًا؛ الموقع يعمل كاملًا بدونه.</div>
    </div>
  </section>
  <section class="lp-sec">
    <h2>مصادره موثوقة</h2>
    <ul>
      <li><b>النص القرآني</b>: رواية حفص عن عاصم بالرسم العثماني من مصادر مفتوحة مدققة.</li>
      <li><b>التلاوات</b>: مكتبات تلاوات مفتوحة (everyayah وغيرها) بجودات متعددة.</li>
      <li><b>الترجمات</b>: ترجمات معاني القرآن من alquran.cloud (8 لغات).</li>
      <li><b>مواقيت الصلاة</b>: خوارزميات PrayTimes مدمجة مع 13 طريقة معتمدة (أم القرى، الهيئة المصرية، رابطة العالم الإسلامي…).</li>
      <li><b>الأذكار</b>: نصوص حصن المسلم للإمام النووي.</li>
      <li><b>التاريخ الهجري</b>: تقويم أم القرى عبر معايير Unicode.</li>
    </ul>
  </section>
  <section class="lp-sec">
    <h2>لماذا مجاني تمامًا؟</h2>
    <p>لا إعلانات، ولا بيع بيانات، ولا استعلامات مدفوعة — لا نموذج ربح أصلًا. الموقع صدقة جارية يغطي تشغيله على خوادم Vercel، ونعداد الإعلانات أو التمويل لا يُذكر هنا إلا إن تغيّر الوضع يومًا ما — عندها سيُكتب صراحةً في <a href="/terms/" style="color:var(--gold-3)">الشروط</a> قبل أي تغيير جوهري.</p>
  </section>`,
  faq: [
    ["من يتحمل تكاليف الموقع؟", "المشروع يُدار كصدقة جارية: لا مالك إعلاني ولا مستثمر، والتشغيل مغطّى ضمنيًا دون مقابل من المستخدم."],
    ["هل أحتاج إلى حساب للاستخدام؟", "لا — كل الأدوات والمولّد يعملان بلا تسجيل؛ الحساب الاختياري يضيف فقط جدولة النشر إلى يوتيوب."],
    ["كيف أقترح ميزة أو أبلغ عن خطأ؟", "عبر صفحة التواصل — كل ملاحظة تُقرأ، ونردّ خلال يومي عمل."]
  ],
  links: [
    ["/", "الصفحة الرئيسية"], ["/contact/", "تواصل معنا"], ["/privacy/", "الخصوصية"],
    ["/terms/", "شروط الاستخدام"], ["/ar/islamic-tools/", "32 أداة"], ["/developers/mcp/", "MCP للمطوّرين"]
  ]
},
{
  path: "/terms/",
  title: "شروط الاستخدام — قرآن ريلز",
  desc: "شروط استخدام موقع قرآن ريلز: الملكية الفكرية لمخرجاتك، الاستخدام المقبول، إخلاء المسؤولية عن الأدوات الإرشادية، الحساب الاختياري، والتغييرات.",
  keywords: "شروط الاستخدام, اتفاقية الاستخدام, قرآن ريلز",
  h1: "شروط الاستخدام",
  lead: "باستخدامك لـ«قرآن ريلز» فإنك توافق على الشروط التالية — كتبتها بلغة واضحة بلا لغة محامين، ويمكن قراءتها في دقيقتين.",
  cta: [{ t: "↩️ رجوع للموقع", h: "/" }, { t: "privacy", h: "/privacy/" }],
  badges: ["آخر تحديث: 27 أكتوبر 2026"],
  body: `
  <section class="lp-sec">
    <h2>1 · الخدمة كما هي</h2>
    <p>«قرآن ريلز» خدمة مجانية تُقدَّم «كما هي» (as-is): مولّد فيديو قرآني وأدوات إسلامية تعمل داخل متصفحك. قد نُحسّن أو نُعلّق ميزات، ولا نضمن عمل الخدمة دون انقطاع أو خلوّها من الأخطاء.</p>
  </section>
  <section class="lp-sec">
    <h2>2 · ملكية المخرجات</h2>
    <p>الفيديوهات والملفات التي تُنتجها من الموقع <b>ملكك أنت</b> — تنشرها حيث تشاء وبأي حساب، بلا نسبة لنا وبلا إسناد إلزامي إلينا. أما نصوص الموقع وتصميمه وكوده وشعاراته فملك للمشروع، ولا يجوز إعادة نشرها كأنها مشروعك دون إذن.</p>
  </section>
  <section class="lp-sec">
    <h2>3 · الاستخدام المقبول</h2>
    <ul>
      <li>لا تستخدم المخرجات في ادّعاء وصفي غير صحيح لأي جهة شرعية أو علمية.</li>
      <li>لا تُسقط الآيات عن سياقها أو تعرضها بمعانٍ مخالفة مقصودة.</li>
      <li>لا تستخدم الخدمة لأي غرض مخالف للقانون أو لحقوق الآخرين.</li>
      <li>لا تحاول تعطيل الموقع أو استخدامه آليًا بشكل يضرّ بتشغيله (يُسمح بالروبوتات الودّية: بحث محركات ووكلاء MCP).</li>
    </ul>
  </section>
  <section class="lp-sec">
    <h2>4 · إخلاء مسؤولية</h2>
    <p>الأدوات (الزكاة، المواريث، الكفارة، المواقيت، الهجري…) <b>إرشادية</b> مبنية على أطر محتدمة، وليست فتوى ولا حكمًا شخصيًا — فراجع أهل العلم لمسألة بعينها. والنصوص القرآنية والتلاوات مقدَّمة من مصادر مفتوحة نذكرها في <a href="/about/" style="color:var(--gold-3)">صفحة من نحن</a>، ونتعامل معها بأمانة لكننا لا نقدّم ضمانًا لخلوّها من وصفة تقنية بسيطة.</p>
  </section>
  <section class="lp-sec">
    <h2>5 · الحساب الاختياري</h2>
    <p>التسجيل (Google أو رابط سحري بالبريد) اختياري، ويُستخدم لخاصية واحدة: جدولة النشر إلى يوتيوب. يمكنك حذف حسابك في أي وقت، ون的性格ًا سلوك الحذف في <a href="/privacy/" style="color:var(--gold-3)">سياسة الخصوصية</a>.</p>
  </section>
  <section class="lp-sec">
    <h2>6 · التغييرات</h2>
    <p>قد نُحدّث هذه الشروط، وسيظهر تاريخ «آخر تحديث» أعلى الصفحة. استمرارك في الاستخدام بعد التحديث يعني قبولك للنسخة الجديدة.</p>
  </section>`,
  faq: [
    ["هل يمكنني استخدام الفيديوهات تجاريًا؟", "نعم، مخرجاتك ملكك؛ المطلوب فقط ألّا تستخدمها بادّعاءات مضلِّلة أو مخالفة للقانون."],
    ["هل الخدمة مجانية دائمًا؟", "النموذج الحالي مجاني بلا حدود؛ أي تغيير جوهري (حدود أو أسعار) سيُعلن صراحةً قبل تطبيقه."]
  ],
  links: [["/", "الرئيسية"], ["/about/", "من نحن"], ["/privacy/", "الخصوصية"], ["/contact/", "تواصل"]]
},
{
  path: "/privacy/",
  title: "سياسة الخصوصية — قرآن ريلز",
  desc: "خصوصيتك في قرآن ريلز: لا كوكيز إعلانية ولا أدوات تحليل، كل شيء يعمل محليًا في متصفحك، والحساب الاختياري يحفظ بريدك فقط، وحقوقك كاملة.",
  keywords: "سياسة الخصوصية, خصوصية البيانات, بدون تتبّع, قرآن ريلز",
  h1: "سياسة الخصوصية",
  lead: "القاعدة الأولى: نجمع أقل شيء ممكن — ويُفضَّل ألا نجمع شيئًا. لا كوكيز إعلانية، ولا أدوات تحليل زيارات، ولا بيع بيانات — ولا يوجد نموذج ربح يتطلب ذلك أصلًا.",
  cta: [{ t: "↩️ رجوع للموقع", h: "/" }, { t: "تواصل", h: "/contact/" }],
  badges: ["بلا كوكيز إعلانية", "بلا Google Analytics", "بياناتك في جهازك", "آخر تحديث: 27 أكتوبر 2026"],
  body: `
  <section class="lp-sec">
    <h2>1 · ما الذي يُخزَّن في جهازك؟</h2>
    <p>معظم حالة الموقع (اختياراتك، عدّاداتك، سجل أعمالك، إعدادات الأدوات) تُحفظ في <b>التخزين المحلي/الجلسة</b> داخل متصفحك ولا تغادر جهازك إطلاقًا. لو مسحت بيانات المتصفح مسحتها معها.</p>
  </section>
  <section class="lp-sec">
    <h2>2 · ما الذي لا نقوم به؟</h2>
    <ul>
      <li>لا كوكيز إعلانية ولا مُتعقِّبات تابعة لأطراف ثالثة.</li>
      <li>لا Google Analytics ولا similar — لا نعرف عدد الزوار حتى.</li>
      <li>لا بيع أو تأجير أو مشاركة بيانات مع معلنين (لا يوجد معلنون أصلًا).</li>
      <li>لا ملفات تعريف إعلانية (ad profiles).</li>
    </ul>
  </section>
  <section class="lp-sec">
    <h2>3 · الحساب الاختياري</h2>
    <p>إن اخترت التسجيل فنحفظ <b>بريدك الإلكتروني فقط</b> (عبر Supabase) لتسجيل دخولك وجدولة نشرك إلى يوتيوب. لا نطلب اسمًا ولا هاتفًا ولا صورة. يمكن لحسابك حذف نفسه، وعند الحذف تُحذف بيانات الحساب وجدولته من قاعدة البيانات.</p>
  </section>
  <section class="lp-sec">
    <h2>4 · أطراف ثالثة تقنية محدودة</h2>
    <ul>
      <li><b>Vercel</b>: استضافة الصفحات والدوال — وقد تسجّل عناوين IP في سجلات تشغيلها القياسية.</li>
      <li><b>Supabase</b>: قاعدة بيانات الحساب الاختياري ورسائل صفحة التواصل.</li>
      <li><b>مصادر المحتوى</b>: طلبات الترجمة/التحقق قد تمر عبر واجهات مفتوحة (alquran.cloud) دون إرسال هويتك — الطلب بمعرّف السورة لا بعنوانك.</li>
    </ul>
    <p>أداة التحقق من Google (Search Console) تخصّ مالك الموقع في لوحته ولا تجمع بيانات زوّارك.</p>
  </section>
  <section class="lp-sec">
    <h2>5 · حقوقك وتواصلك</h2>
    <p>تطلب حذف بياناتك أو استفسار عنها في أي وقت عبر <a href="/contact/" style="color:var(--gold-3)">صفحة التواصل</a>، ونستجيب خلال يومي عمل بحد أقصى.</p>
  </section>`,
  faq: [
    ["هل الموقع يستخدم ملفات تعريف اقتراح الإعلانات؟", "لا — لا إعلانات ولا تتبّع ولا تحليل زيارات."],
    ["هل بياناتي تُرفع لخوادمكم؟", "حالة الأدوات لا تُرفع؛ يُرفع فقط ما تكتبه في رسالة التواصل أو حسابك الاختياري المُصرَّح به."],
    ["هل يمكنني حذف حسابي بنفسي؟", "نعم — عبر إعدادات الحساب، وتنعكس الحذف فورًا على الجدولة المحفوظة."]
  ],
  links: [["/", "الرئيسية"], ["/terms/", "الشروط"], ["/about/", "من نحن"], ["/contact/", "تواصل"]]
},
{
  path: "/contact/",
  title: "تواصل معنا — قرآن ريلز",
  desc: "أرسل استفسارك أو اقتراحك أو بلاغ خطأ إلى فريق قرآن ريلز عبر نموذج سريع — نقرأ كل رسالة ونردّ عادة خلال يومي عمل.",
  keywords: "تواصل معنا, اقتراح, بلاغ خطأ, دعم قرآن ريلز",
  h1: "تواصل معنا",
  lead: "اقتراح ميزة؟ بلاغ خطأ؟ سؤال عن تعاون أو ترجمة؟ اكتب لنا رسالة — نقرأ كل واحدة ونردّ عادة خلال يومي عمل.",
  cta: [{ t: "↩️ رجوع للموقع", h: "/" }, { t: "about", h: "/about/" }],
  badges: ["ردّ خلال يومي عمل", "لا نبيع بياناتك"],
  ldType: "ContactPage",
  body: `
  <div class="lp-sec">
    <form class="form" id="cForm" novalidate>
      <label for="cName">الاسم</label>
      <input id="cName" name="cname" type="text" maxlength="120" required placeholder="اسمك أو كنيتك">
      <label for="cEmail">بريدك (للردّ)</label>
      <input id="cEmail" name="cemail" type="email" maxlength="200" required placeholder="name@example.com">
      <label for="cMsg">رسالتك</label>
      <textarea id="cMsg" name="cmsg" maxlength="5000" required placeholder="اكتب رسالتك هنا…"></textarea>
      <input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button class="btn btn-em" type="submit">إرسال الرسالة</button>
      <div id="formMsg" role="status" aria-live="polite"></div>
    </form>
    <p style="text-align:center;font-size:.88rem">بإرسالك الرسالة توافق على معالجتها وفق <a href="/privacy/" style="color:var(--gold-3)">سياسة الخصوصية</a> — لا نستخدم بريدك إلا للردّ.</p>
  </div>`,
  faq: [
    ["كم تستغرق الإجابة؟", "عادة يوما عمل كحد أقصى، ونقرأ كل رسالة شخصيًا."],
    ["هل يمكن الاقتراح بلا اسم؟", "نعم — الاسم اختياري عمليًّا، والأهم مضمون الرسالة."],
    ["هل تقبلون التعاون أو الترجمة؟", "نعم — اذكر في رسالتك نوع التعاون المقترح وسنتواصل."]
  ],
  links: [["/", "الرئيسية"], ["/about/", "من نحن"], ["/terms/", "الشروط"], ["/privacy/", "الخصوصية"]],
  script: `
(async () => {
  const f = document.getElementById("cForm"), msg = document.getElementById("formMsg");
  const t0 = Date.now();
  f.addEventListener("submit", async e => {
    e.preventDefault();
    if (f.elements["website"].value) return; // honeypot
    const name = f.elements["cname"].value.trim();
    const email = f.elements["cemail"].value.trim();
    const message = f.elements["cmsg"].value.trim();
    if (!name || !email || !message) { msg.textContent = "املأ جميع الحقول من فضلك."; return; }
    if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)) { msg.textContent = "صيغة البريد غير صحيحة."; return; }
    if (Date.now() - t0 < 2500) { msg.textContent = "ثوانٍ قليلة فقط…"; return; }
    msg.textContent = "جارٍ الإرسال…";
    try {
      const cfg = await (await fetch("/api/app-config")).json();
      const s = cfg && cfg.supabase;
      if (!s || !s.url || !s.anon) throw new Error("config");
      const r = await fetch(s.url + "/rest/v1/rpc/submit_contact", {
        method: "POST",
        headers: { apikey: s.anon, Authorization: "Bearer " + s.anon, "Content-Type": "application/json" },
        body: JSON.stringify({ p_name: name, p_email: email, p_message: message, p_user_agent: (navigator.userAgent || "").slice(0, 300) })
      });
      const j = r.ok ? await r.json() : null;
      if (!r.ok || !j || !j.ok) throw new Error(r.status);
      f.reset(); msg.textContent = "وصلتنا رسالتك — شكرًا لك! ✉️";
    } catch { msg.textContent = "تعذّر الإرسال الآن؛ جرّب بعد قليل من فضلك."; }
  });
})();`
}
];

for (const p of TRUST) {
  write(p.path.replace(/^\//, "") + "index.html", page({
    lang: "ar", path: p.path, title: p.title, desc: p.desc, keywords: p.keywords,
    h1: p.h1, lead: p.lead, cta: p.cta, badges: p.badges,
    body: p.body, faq: p.faq, links: p.links, ldType: p.ldType, script: p.script
  }));
}

/* ============================= 3) القرّاء الـ48 ============================= */
const seen = new Set();
const recSlugs = REC.map(r => {
  let s = slugify(r.id);
  if (seen.has(s)) s = s + "-" + slugify(r.folder).slice(0, 6);
  seen.add(s);
  return { r, slug: s };
});
if (recSlugs.length !== 47 || seen.size !== 47) { console.error("slug collision or wrong count:", seen.size); process.exit(1); }

// الفهرس
const hubBody = `
  <div class="lp-sec">
    <p>اختر القارئ لتفتح مقطعك بصوته مباشرة — كل صفحة تشرح أسلوب القارئ وتفتح المولّد مُهيّأً باسمه. التلاوات برواية حفص عن عاصم والنص العثماني داخل الفيديو، وتصدير MP4 عمودي 1080×1920 مجانًا.</p>
    <div class="rc-grid">
${recSlugs.map(({ r, slug }) => `      <a class="rc-card" href="/ar/reciter/${slug}/"><b>${shortOf(r.n)}</b>${r.tag ? `<i>${r.tag}</i>` : ""}</a>`).join("\n")}
    </div>
  </div>`;

write("ar/reciters/index.html", page({
  lang: "ar", path: "/ar/reciters/",
  title: "فهرس قرّاء القرآن — 47 قارئًا لصناعة المقاطع والريلز | قرآن ريلز",
  desc: "فهرس كامل بـ47 قارئًا متاحين في مولّد فيديو القرآن: العفاسي، عبدالباسط، السديس، الشريم، المعيقلي، الحصري، المنشاوي، الحذيفي وغيرهم — اختر صوتك واصنع مقطعًا فورًا.",
  keywords: "قراء القرآن, قارئ قرآن للفيديو, مشاري العفاسي فيديو, تلاوة لصنع مقطع",
  h1: "47 قارئًا — اختر صوتك لفيديوك القادم",
  lead: "من الأصوات الذهبية الكلاسيكية إلى أئمة الحرمين اليوم: اختر القارئ لتفتح صفحة تفاصيله أو ابدأ بالمولّد مباشرة بصوته.",
  cta: [{ t: "🎬 ابدأ بالمولّد", h: "/#/" }, { t: "💡 أفكار فيديو قرآن", h: "/ar/quran-video-tiktok/" }],
  badges: ["47 قارئًا", "رواية حفص", "معاينة صوتية", "مجاني"],
  body: hubBody,
  faq: [
    ["هل كل التلاوات برواية حفص عن عاصم؟", "نعم — النص القرآني في المولّد حفص عن عاصم بالرسم العثماني، والتلاوات من مكتبات مفتوحة موثوقة."],
    ["هل يمكنني معاينة صوت القارئ قبل الاختيار؟", "نعم — في المولّد تسمع معاينة فورية لكل آية قبل التصدير."],
    ["هل اختيار القارئ يؤثر في السرعة أو الجودة؟", "لا — التصدير يجري في متصفحك بالجودة نفسها مهما اخترت."]
  ],
  links: [
    ["/", "المولّد"], ["/ar/quran-video-maker/", "صانع الفيديو"],
    ["/ar/quran-video-with-translation/", "ترجمة داخل الفيديو"], ["/ar/short-quran-verses-video/", "أقصر الآيات"],
    ["/en/", "English"]
  ]
}));

// صفحات القرّاء
for (const { r, slug } of recSlugs) {
  const short = shortOf(r.n);
  const folder = r.folder;
  const facts = reciterFacts(r, short);
  const body = `
  <div class="crumb"><a href="/">الرئيسية</a> ← <a href="/ar/reciters/">القرّاء</a> ← ${short}</div>
  <section class="lp-sec">
    <h2>من هو ${short}؟</h2>
    <p>${facts} صفحة مخصّصة لصنع مقاطعك بصوته داخل «قرآن ريلز»: تختار السورة والآيات، فيُركَّب صوت ${short} على النص العثماني بمقاس 9:16 جاهز للنشر.</p>
    ${r.tag ? `<p>وسمه في المكتبة: <b>${r.tag}</b>.</p>` : ""}
  </section>
  <section class="lp-sec">
    <h2>ما الذي تحصل عليه في الفيديو؟</h2>
    <div class="feat">
      <div><b>تلاوة ${short}</b>مزامنة آيةً بآية مع المعاينة والتصدير.</div>
      <div><b>نص عثماني واضح</b>حفص عن عاصم بتشكيل كامل على الشاشة.</div>
      <div><b>خلفية وترجمة</b>14 خلفية و8 لغات ترجمة اختيارية داخل المشهد.</div>
      <div><b>MP4 1080×1920</b>عمودي بلا علامة مائية يُحفظ على جهازك.</div>
    </div>
    <div class="lp-cta" style="margin-top:18px">
      <a class="btn btn-em" href="/?r=${encodeURIComponent(folder)}">🎙️ اصنع مقطعًا بصوت ${short}</a>
      <a class="btn" href="/ar/reciters/">كل القرّاء</a>
    </div>
  </section>
  <section class="lp-sec">
    <h2>سور مقترحة مع هذا الصوت</h2>
    <p>ابدأ بما يناسب أسلوب ${short}: <b>الكوثر</b> و<b>العصر</b> و<b>النصر</b> للمقاطع الثوانٍ · <b>الإخلاص</b> و<b>الفلق</b> و<b>الناس</b> للأدعية · <b>الكهف</b> و<b>مريم</b> للمقاطع الأطول تأمّليًا. <a href="/ar/short-quran-verses-video/" style="color:var(--gold-3)">القائمة الكاملة</a>.</p>
  </section>`;
  const faq = [
    [`هل تلاوة ${short} برواية حفص عن عاصم؟`, `نعم — النص والمطابقة في المولّد برواية حفص عن عاصم بالرسم العثماني، والتلاوة من تسجيلات مفتوحة موثوقة.`],
    [`كيف أصنع فيديو بصوت ${short}؟`, `اضغط زر «صنع مقطعًا بصوت ${short}» في هذه الصفحة — يفتح المولّد مُهيّأً بصوته، ثم اختر السورة والآيات والخلفية وصدّر MP4 عموديًا.`],
    ["هل الموقع مجاني بهذا القارئ؟", "نعم — كل القرّاء الـ47 متاحة بلا حدود وبلا علامة مائية وبلا حساب."]
  ];
  const extraLd = JSON.stringify({
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "الرئيسية", item: ORIGIN + "/" },
      { "@type": "ListItem", position: 2, name: "القرّاء", item: ORIGIN + "/ar/reciters/" },
      { "@type": "ListItem", position: 3, name: short, item: ORIGIN + `/ar/reciter/${slug}/` }
    ]
  });
  write(`ar/reciter/${slug}/index.html`, page({
    lang: "ar", path: `/ar/reciter/${slug}/`,
    title: `تلاوة ${short} — اصنع فيديو قرآن بصوت ${short} | قرآن ريلز`,
    desc: `اصنع فيديو قرآن بصوت ${short}${r.tag ? " (" + r.tag + ")" : ""}: نص عثماني برواية حفص، خلفيات وترجمة، تصدير MP4 عمودي 1080×1920 مجانًا وبلا علامة مائية — من المتصفح مباشرة.`,
    keywords: `${short} فيديو, تلاوة ${short}, مقطع قرآن ${short}, ${r.id} quran video`,
    h1: `تلاوة ${short} — اصنع فيديو قرآنيًا بصوته`,
    lead: `مقطعك القرآني القادم بصوت ${short}؟ اختر الآيات ودع التلاوة والنص العثماني يعملان — التصدير فوري ومباشر إلى جهازك.`,
    cta: [{ t: `🎙️ اصنع مقطعًا بصوت ${short}`, h: `/?r=${encodeURIComponent(folder)}` }, { t: "فهرس القرّاء", h: "/ar/reciters/" }],
    badges: [r.tag || "47 قارئًا", "رواية حفص", "MP4 9:16", "مجاني"],
    body, faq, extraLd,
    links: [
      ["/", "المولّد"], ["/ar/reciters/", "كل القرّاء"],
      ["/ar/quran-video-maker/", "صانع الفيديو"], ["/ar/quran-video-with-translation/", "ترجمة داخل الفيديو"],
      [`/?r=${encodeURIComponent(folder)}`, "ابدأ الآن"]
    ]
  }));
}

console.log("K12 done:", EN.length, "en +", TRUST.length, "trust +", recSlugs.length + 1, "reciter pages");

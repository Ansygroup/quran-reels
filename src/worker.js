// Quran Reels on Cloudflare Workers: static site (assets) + the small public API that ran on Vercel.
// Ported: /proxy (allow-listed CORS proxy with Range support), /api/ip, /api/app-config.
// Not ported (need secrets, headless Chrome or cron): /api/gw, /api/autopilot, /api/oauth, /api/social,
// /api/publish, /api/contact, /api/mcp. They answer 503 so the site degrades cleanly.
const ALLOWED_HOSTS = new Set([
  "everyayah.com", "www.everyayah.com", "api.alquran.cloud", "cdn.jsdelivr.net", "raw.githubusercontent.com",
  "qurango.net", "overpass-api.de", "overpass.osm.ch", "overpass.kumi.systems", "lz4.overpass-api.de",
  "api.aladhan.com", "nominatim.openstreetmap.org",
]);
const MAX_BYTES = 25 * 1024 * 1024;
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const e = hits.get(ip);
  if (!e || now - e.t > 60000) { hits.set(ip, { t: now, n: 1 }); if (hits.size > 5000) hits.clear(); return false; }
  e.n++;
  return e.n > 240;
}
const text = (status, body, extra) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store", ...(extra || {}) } });
const json = (status, obj, cache) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": cache || "no-store" } });
const okHost = (u) => (u.protocol === "http:" || u.protocol === "https:") && ALLOWED_HOSTS.has(u.hostname.toLowerCase());

async function proxy(request, url) {
  if (request.method !== "GET" && request.method !== "HEAD") return text(405, "method not allowed", { allow: "GET, HEAD" });
  const target = url.searchParams.get("u") || url.searchParams.get("url") || "";
  if (!target) return text(400, "missing url");
  let tp;
  try { tp = new URL(target); } catch { return text(400, "bad url"); }
  if (!okHost(tp)) return text(403, "host not allowed");
  if (RECITERS_PUBLIC_ONLY && /(^|\.)everyayah\.com$/i.test(tp.hostname)) return text(403, "reciter audio unavailable");
  const range = request.headers.get("range");
  let cur = tp.toString(), r = null;
  for (let hop = 0; hop < 4; hop++) {
    let u;
    try { u = new URL(cur); } catch { return text(502, "upstream error: bad redirect"); }
    if (!okHost(u)) return text(502, "upstream error: redirect to host not allowed");
    const h = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) QuranReels/1.0", Accept: "*/*" };
    if (range && hop === 0) h.Range = range;
    try {
      r = await fetch(cur, { method: "GET", headers: h, redirect: "manual", cf: { cacheEverything: true, cacheTtl: 21600 } });
    } catch (e) { return text(502, "upstream error: " + (e && e.message ? e.message : "fetch failed")); }
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { cur = new URL(r.headers.get("location"), cur).toString(); continue; }
    break;
  }
  if (!r || (!r.ok && r.status !== 206)) return text(502, "upstream error: status " + (r ? r.status : "none"));
  const len = parseInt(r.headers.get("content-length") || "0", 10);
  if (len > MAX_BYTES) return text(413, "response too large");
  let type = r.headers.get("content-type") || "application/octet-stream";
  if (type.startsWith("text/html") && !type.includes("charset")) type += "; charset=utf-8";
  const h = new Headers({ "content-type": type, "access-control-allow-origin": "*", "accept-ranges": "bytes" });
  h.set("cache-control", r.status === 206 ? "public, max-age=600" : "public, max-age=3600, s-maxage=21600");
  const cr = r.headers.get("content-range"); if (cr) h.set("content-range", cr);
  if (r.headers.get("content-length")) h.set("content-length", r.headers.get("content-length"));
  return new Response(request.method === "HEAD" ? null : r.body, { status: r.status, headers: h });
}

// Same-origin cached copy of the two Aaqib Azeez archive.org items (CC0 and CC BY-SA 4.0). Only these items, only 001-114.mp3.
const AUDIO_ITEMS = { "cc0": "quran-murattal-aaqib-azeez-cc0", "by-sa": "quran-murattal-aaqib-azeez-by-sa" };
async function audio(request, p) {
  if (request.method !== "GET" && request.method !== "HEAD") return text(405, "method not allowed", { allow: "GET, HEAD" });
  const m = /^\/audio\/(cc0|by-sa)\/(\d{3})\.mp3$/.exec(p);
  const n = m ? parseInt(m[2], 10) : 0;
  if (!m || n < 1 || n > 114) return text(404, "not found");
  const h = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) QuranReels/1.0", Accept: "*/*" };
  const range = request.headers.get("range");
  if (range) h.Range = range;
  let r;
  try {
    r = await fetch("https://archive.org/download/" + AUDIO_ITEMS[m[1]] + "/" + m[2] + ".mp3", { headers: h, redirect: "follow", cf: { cacheEverything: true, cacheTtl: 2592000, cacheTtlByStatus: { "200-299": 2592000, "400-599": 0 } } });
  } catch (e) { return text(502, "upstream error: " + (e && e.message ? e.message : "fetch failed")); }
  if (!r.ok && r.status !== 206) return text(502, "upstream error: status " + r.status);
  const out = new Headers({ "content-type": "audio/mpeg", "accept-ranges": "bytes", "access-control-allow-origin": "*", "cache-control": "public, max-age=86400, s-maxage=2592000" });
  for (const k of ["content-length", "content-range"]) { const v = r.headers.get(k); if (v) out.set(k, v); }
  return new Response(request.method === "HEAD" ? null : r.body, { status: r.status, headers: out });
}

function ip(request) {
  const cf = request.cf || {};
  const lat = parseFloat(cf.latitude), lon = parseFloat(cf.longitude);
  if (isFinite(lat) && isFinite(lon)) {
    let country = cf.country || "";
    try { country = new Intl.DisplayNames(["en"], { type: "region" }).of(String(cf.country).toUpperCase()) || country; } catch {}
    return json(200, { country_name: country, city: String(cf.city || "").slice(0, 80), latitude: lat, longitude: lon, source: "cloudflare-geo" }, "public, max-age=3600");
  }
  return json(200, { country_name: "Egypt", city: "", latitude: 30.0444, longitude: 31.2357 }, "public, max-age=3600");
}

const OLD_HOST = "quran-reels-tau.vercel.app";
const NEW_HOST = "quranreels.chatora.us.ci";
const KEEP_ARTICLES = new Set(["quran-video-maker-guide","short-quran-verses-video","quran-video-no-music","quran-video-no-watermark","quran-word-highlight-video","quran-translation-video","quran-tafsir-video","free-quran-video-maker","quran-reels-ai","quran-video-ramadan","khushoo-quran-video","quran-video-specs","sadaqa-jariya-video","yasser-dossary-quran-video","mishary-rashid-quran-video","best-quran-reciters-video","abdulbasit-murattal-vs-mujawwad","minshawi-rare-recitations","maher-muaiqly-video","quran-reciter-for-tiktok","quran-recitation-styles","quran-radio","reciter-voice-rights","quran-audio-formats","prayer-times-accuracy","qibla-direction-guide","nearby-mosques-guide","how-to-pray-beginner","qada-salah-plan","rawatib-sunnah","hijri-date-today","islamic-calendar-2026","daily-ayah-routine","ayat-bil-mawdoo","sawm-tracker-guide","friday-prayer-routine","prayer-times-dst","tahfeez-quran-atfal","makharij-al-huruf","quran-khatma-plan","group-khatma-family","quran-looper-tips","quran-quiz-memory","tajweed-basics","hifz-30-days-plan","weekly-revision-system","memorize-juz-amma","hifz-streak-habit","quran-learning-order","quran-reciter-list-video","quran-pronunciation-video","adhkar-sabah-guide","adhkar-masaa-guide","adhkar-sleep-guide","asma-allah-husna-guide","hisn-almuslim-guide","adhkar-friday","adhkar-counter-tips","morning-evening-azkar-habit","adhkar-video-content","tasbih-digital-guide","adhkar-after-prayer","azkar-starting-small","adhkar-ramadan","ramadan-reels-plan","ten-days-dhul-hijja","laylatul-qadr-prep","shaban-preparation","eid-fitr-video","hijri-new-year","ashura-fasting","last-10-ramadan-content","islamic-mourning-muharram","hajj-season-content","islamic-calendar-observances","iftar-sahur-adhkar","islamic-baby-names-guide","naming-newborn-islamic","quran-for-kids-routine","family-quran-evening","islamic-family-schedule","kids-quran-rewards","halal-product-checker","e-codes-guide","crypto-zakat-calculator","zakat-on-savings","mawarith-calculator-guide","kaffara-calculator-guide","seo-for-quran-videos","quran-content-calendar","multi-platform-reels","quran-video-engagement","ethical-quran-content","hashtags-quran-reels","quran-channel-growth","quran-content-audit","quran-captions-styles","quran-content-licensing","search-intent-quran-content","quran-reels-trends","custom-background-video","preview-before-export","video-quality-720-vs-1080","reels-first-second","whatsapp-status-verse","instagram-quran-reels","short-video-retention","quran-video-length","slideshow-quran-video","night-quran-video","your-first-quran-video","faceless-quran-channel","listen-before-choose","recitation-breath-pace","audio-effects-quran","recitation-styles-by-region","reciters-for-work-study","memorize-with-reciter","mimic-recitation-drill","listen-and-read-together","reciter-playlist-structure","series-voice-variety","test-audio-on-phone","caption-audio-credits","reciter-name-search","khushoo-prayer-stages","adhan-alarms-setup","wudu-before-adhan","five-prayers-streak","jummah-mosque-benefit","qibla-while-traveling","monthly-hijri-planning","daily-ayah-depth","voluntary-fasting-routine","prayer-around-work","thursday-for-friday","dual-date-logging","ear-first-memorization","hifz-desk-setup","write-what-you-memorize","mistake-log","paper-vs-app-hifz","mutashabihat-care","hifz-before-sleep","comeback-after-gap","teach-to-memorize","daily-portion-size","hifz-study-buddy","memorized-in-prayer","travel-adhkar-routine","everyday-adhkar-water-food","monthly-azkar-review","brief-azkar-when-busy","dhikr-in-hard-moment","azkar-before-phone","counting-without-app","kids-azkar-game","dhikr-in-daily-commute","habitual-praise","hear-vs-recite-azkar","quranic-azkar-first","travel-season-content","adha-family-content","viral-date-claims","kids-summer-quran","winter-nights-quran","year-end-hijri-review","graduation-season","nikah-congratulations","newborn-greeting-video","monthly-hijri-renewal","sacred-months-content","hijri-greeting-bank","umrah-winter-season","friday-family-kahf","teen-screen-hifz","family-one-register","house-rules-quran","newlyweds-quran-routine","parents-right-video","halal-shopping-3-questions","zakat-yearly-reminder","mawarith-family-meeting","lullaby-no-music","family-quiz-night","kids-sadaqah-box","home-prayer-corner","thumbnail-text-guide","two-language-channels","archive-republish-6m","pinned-comment-strategy","community-posts-ideas","shorts-vs-reels-differences","title-ab-testing","collab-cross-promotion","shorts-to-long-form","series-architecture","audience-questions-content","remove-weak-content","three-content-pillars","quran-reel-hooks","voiceover-over-recitation","daily-video-schedule","export-checklist","readability-one-glance","quran-video-series-format","reciter-content-match","reciters-by-tone","reciter-change-announcement","reciter-pronunciation-check","quran-audio-troubleshoot","compare-reciters-fairly","reciter-by-time-of-day","prayer-times-while-traveling","congregation-at-work","qiyam-start-guide","istikhara-guide","solar-eclipse-prayer","five-on-time-system","ayah-mental-map","ten-minute-hifz-session","tarteel-supports-hifz","stagnant-hifz-fix","repetition-without-awareness","quran-hifz-goal-setting","remote-memorization-checkins","dhikr-at-distress","adhkar-timing-explained","asma-rotation-plan","adhkar-before-meetings","adhkar-memorization-easy","dhikr-walking-commute","hijri-new-year-post","winter-countdowns-calendar","evergreen-vs-seasonal","friday-publish-protocol","after-ramadan-momentum","summer-story-series","countdown-and-channel-link","siblings-not-competition","family-audio-playlist","toddler-two-minute-hifz","homework-versus-quran","daily-deeds-parents","friends-quran-circle","frequency-versus-quality","algorithm-signals-explained","quran-content-monetization","guest-post-islamic-blogs","creator-burnout-recovery","quran-newsletter","long-video-to-shorts","thumbnail-frame-selection","text-entrance-styles","phone-vs-desktop-preview","background-verse-theme","video-end-cta-quran","safe-zones-guide","weekly-theme-system","reciter-library-browse","verify-recording-source","reciter-intro-card","reciters-for-short-verses","choosing-reciter-poll","quran-audio-storage","wudu-travel-kit","witr-how-to-begin","prayer-in-small-apartment","qibla-in-rented-room","fajr-wakeup-system","night-family-prayer","visiting-mosques-prayer","hifz-mistake-tracker","memorize-surah-order","summer-hifz-intensive","why-we-forget-quran","fasting-hifz-adjustment","exams-versus-hifz","dhikr-in-waiting-lines","childrens-meal-adhkar","hisn-30-day-route","new-muslim-adhkar-start","dua-notebook","azkar-versus-sleepy","dhikr-during-chores","ten-days-dhul-hijjah","school-holidays-content","islamic-events-calendar-year","winter-memorization-season","summer-quran-camp","friday-year-planner","family-hifz-leader","children-quran-rewards","quran-in-new-home","children-questions-about-quran","quran-versus-games-balance","different-pace-hifz","parents-and-teen-dialogue","first-100-followers","bio-link-quran-channel"]);
const REWRITE_TYPES = /^(text\/html|application\/xml|text\/xml|text\/plain|application\/json|application\/manifest\+json|application\/ld\+json)/i;


// Only the licensed reciter (Aaqib Azeez) is public. Every other reciter stays in the data but is hidden.
// One switch: set RECITERS_PUBLIC_ONLY = false here and in public/js/data.js (and lib/autopilot.js) to bring them back.
const RECITERS_PUBLIC_ONLY = true;
const HIDDEN_NOTICE_AR = '<p class="lead" style="max-width:760px;margin:0 auto 18px">ملاحظة: خيار الصوت والصانع لهذا القارئ متوقف مؤقتًا حتى يتم توثيق حقوق التلاوة. المتاح حاليًا هو القارئ المرخّص عاقب عزيز. <a href="/ar/quran-video-maker/">افتح الصانع</a></p>';
const NOINDEX_PAGES = new Set(["/ar/reciters", "/ar/best-quran-reciters-video", "/articles/best-quran-reciters-video", "/en/articles/best-quran-reciters-video"]);
function publicOnlyText(body, p, ct) {
  const isHtml = /text\/html/i.test(ct), isXml = /xml/i.test(ct);
  if (isXml && p === "/sitemap.xml") body = body.replace(/<url>(?:(?!<\/url>)[\s\S])*?<loc>[^<]*(?:\/ar\/reciter\/|\/ar\/reciters\/|\/best-quran-reciters-video\/)[^<]*<\/loc>[\s\S]*?<\/url>\s*/g, "");
  const rep = [
    ["تصفّح 47 قارئًا للقرآن، بينهم العفاسي وعبدالباسط والسديس والمنشاوي. استمع إلى التلاوات واختر قارئًا لفيديوك القرآني.", "فهرس قرّاء القرآن: القارئ المرخّص عاقب عزيز متاح في الصانع، وبقية القرّاء متوقفون مؤقتًا حتى توثيق حقوق التلاوة."],
    ["<b id=\"statReciters\">47</b><span>قارئًا مشهورًا</span>", "<b id=\"statReciters\">1</b><span>قارئ مرخّص</span>"],
    ["47 صفحة قارئ فردية (`/ar/reciter/<slug>/`) بروابط مسبق تعبئة `/?r=<folder>` تفتح المولّد مُهيّأً بصوته.", "فهرس القرّاء وصفحاتهم معلوماتية بلا صوت وغير مفهرسة؛ القارئ المتاح في الصانع حاليًا: عاقب عزيز (مرخّص)."],
    ["نعم — كل القرّاء الـ47 متاحة", "نعم — القارئ المرخّص عاقب عزيز متاح"],
    ["فهرس القرّاء الـ47", "فهرس القرّاء"], ["فهرس الأصوات الـ47", "فهرس الأصوات"], ["من القرّاء الـ47", "من القرّاء"], ["القرّاء الـ47", "القرّاء"],
    ["All 47 reciters", "The licensed reciter"],
    ["(47 qari tersedia)", "(qari berlisensi tersedia)"],
    ["47 قارئًا مشهورًا", "قارئ مرخّص"], ["47 قارئًا معروفًا", "قارئ مرخّص"], ["47 قارئًا", "قارئ مرخّص"],
    ["47 reciters", "a licensed reciter"], ["47 qari", "qari berlisensi"],
    ["٤٧ قارئًا", "قارئ مرخّص"],
    ["و`best-quran-reciters-video`", ""],
    ["التلاوات من EveryAyah؛ لم نتحقق من تراخيص جميع التسجيلات للنشر أو الربح.", "الصوت المستخدم هو تلاوة عاقب عزيز المرخّصة فقط (CC0 / CC BY-SA 4.0، عبر Internet Archive)؛ عند النشر اذكر اسم القارئ والترخيص."],
    ["EveryAyah للتلاوات", "أرشيف الإنترنت لتلاوة عاقب عزيز"],
    ["مكتبات تلاوات مفتوحة (everyayah وغيرها) بجودات متعددة", "تلاوة مرخّصة بجودة عالية"],
  ];
  for (const r of rep) if (body.includes(r[0])) body = body.split(r[0]).join(r[1]);
  if (isHtml || /text\/plain|json/i.test(ct)) {
    body = body.replace(/<a\b[^>]*href="https:\/\/everyayah\.com"[^>]*>EveryAyah<\/a>/gi, "أرشيف الإنترنت (تلاوة عاقب عزيز)");
    body = body.replace(/<link rel="dns-prefetch" href="https:\/\/everyayah\.com">\s*/gi, "");
    body = body.replace(/everyayah(\.com)?/gi, "مكتبة التلاوات");
  }
  if (isHtml) {
    if (NOINDEX_PAGES.has(p)) body = body.replace(/<meta name="robots" content="[^"]*">/, '<meta name="robots" content="noindex, follow">');
    body = body.replace(/<a\b[^>]*href="\/\?r=(?!aaqib)[^"]*"[^>]*>[\s\S]*?<\/a>/g, "");
    body = body.replace(/(src|href)="(\/?js\/[a-z0-9-]+\.js\?v=\d+)"/g, '$1="$2&pub=1"');
    if (/^\/ar\/reciter\/[^/]+$/.test(p) || p === "/ar/reciters") {
      if (/^\/ar\/reciter\//.test(p)) body = body.replace(/<meta name="robots" content="[^"]*">/, '<meta name="robots" content="noindex, follow">');
      body = body.replace("</h1>", "</h1>" + HIDDEN_NOTICE_AR);
    }
  }
  return body;
}

async function serveAsset(request, env, p) {
  const res = await env.ASSETS.fetch(request);
  const ct = res.headers.get("content-type") || "";
  const headers = new Headers(res.headers);
  const am = /^\/articles\/([^/]+)(?:\/|$)/.exec(p);
  if (am && !KEEP_ARTICLES.has(am[1]) && /text\/html/i.test(ct)) headers.set("X-Robots-Tag", "noindex, follow");
  if (RECITERS_PUBLIC_ONLY && (/^\/ar\/reciter\/[^/]+$/.test(p) || NOINDEX_PAGES.has(p)) && /text\/html/i.test(ct)) headers.set("X-Robots-Tag", "noindex, follow");
  if (!REWRITE_TYPES.test(ct) || res.status !== 200 || request.method === "HEAD") return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  let body = (await res.text()).split(OLD_HOST).join(NEW_HOST);
  if (RECITERS_PUBLIC_ONLY) body = publicOnlyText(body, p, ct);
  headers.delete("content-length"); headers.delete("etag");
  return new Response(body, { status: res.status, statusText: res.statusText, headers });
}

// The YouTube OAuth, channel, publish and autopilot routes run on the Vercel deployment (Supabase DB, headless Chrome).
// The worker forwards them with cookies and Authorization intact. Reciter choice is enforced here too.
const API_PROXY_ENABLED = false; // flip to true after the Vercel backend runs this branch and accepts Firebase tokens
const API_ORIGIN = "https://quran-reels-tau.vercel.app";
const API_ROUTES = /^\/api\/(autopilot|gw|oauth|social|publish|contact)$/;
const AAQIB_ID = "aaqib-azeez-murattal";
async function forwardApi(request, url, p) {
  let body;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.text();
    if (p === "/api/autopilot" && RECITERS_PUBLIC_ONLY && body) {
      let j = null;
      try { j = JSON.parse(body); } catch {}
      const t = j && typeof j === "object" ? (j.template || j) : null;
      if (t && typeof t === "object") {
        const r = typeof t.reciter === "string" ? t.reciter : "";
        if ((t.reciter_mode === "fixed" || r) && r !== AAQIB_ID) return json(400, { error: "القارئ المتاح حاليًا هو عاقب عزيز فقط" });
      }
    }
  }
  const h = new Headers();
  for (const k of ["authorization", "cookie", "content-type", "accept", "accept-language", "user-agent"]) { const v = request.headers.get(k); if (v) h.set(k, v); }
  h.set("x-forwarded-host", url.host);
  let r;
  try { r = await fetch(API_ORIGIN + p + url.search, { method: request.method, headers: h, body, redirect: "manual" }); }
  catch { return json(503, { error: "This feature is temporarily unavailable.", code: "unavailable" }); }
  const out = new Headers(r.headers);
  out.delete("content-encoding"); out.delete("content-length");
  const loc = out.get("location");
  if (loc && loc.startsWith(API_ORIGIN)) out.set("location", loc.slice(API_ORIGIN.length) || "/");
  return new Response(request.method === "HEAD" ? null : r.body, { status: r.status, headers: out });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname.replace(/\/+$/, "") || "/";
    if (p === "/proxy" || p === "/api/proxy") {
      if (limited(request.headers.get("cf-connecting-ip") || "x")) return text(429, "rate limit");
      return proxy(request, url);
    }
    if (p.startsWith("/audio/")) {
      if (limited(request.headers.get("cf-connecting-ip") || "x")) return text(429, "rate limit");
      return audio(request, p);
    }
    if (p === "/api/ip") return ip(request);
    if (p === "/api/app-config") return json(200, { firebase: { apiKey: "AIzaSyBBnc-2ZHZZVny_AS83LRON5070AllrM38", projectId: "booming-banner-477420-h3", googleClientId: "174209487989-e09fq602et8pvn9ooaj0pqpj6t4ubd04.apps.googleusercontent.com" } }, "public, max-age=3600, s-maxage=3600");
    if (API_PROXY_ENABLED && API_ROUTES.test(p)) return forwardApi(request, url, p);
    if (p.startsWith("/api/")) return json(503, { error: "This feature is temporarily unavailable.", code: "unavailable" });
    return serveAsset(request, env, p);
  },
};

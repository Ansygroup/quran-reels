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

async function serveAsset(request, env, p) {
  const res = await env.ASSETS.fetch(request);
  const ct = res.headers.get("content-type") || "";
  const headers = new Headers(res.headers);
  const am = /^\/articles\/([^/]+)(?:\/|$)/.exec(p);
  if (am && !KEEP_ARTICLES.has(am[1]) && /text\/html/i.test(ct)) headers.set("X-Robots-Tag", "noindex, follow");
  if (!REWRITE_TYPES.test(ct) || res.status !== 200 || request.method === "HEAD") return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  const body = (await res.text()).split(OLD_HOST).join(NEW_HOST);
  headers.delete("content-length"); headers.delete("etag");
  return new Response(body, { status: res.status, statusText: res.statusText, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname.replace(/\/+$/, "") || "/";
    if (p === "/proxy" || p === "/api/proxy") {
      if (limited(request.headers.get("cf-connecting-ip") || "x")) return text(429, "rate limit");
      return proxy(request, url);
    }
    if (p === "/api/ip") return ip(request);
    if (p === "/api/app-config") return json(200, { firebase: { apiKey: "AIzaSyBBnc-2ZHZZVny_AS83LRON5070AllrM38", projectId: "booming-banner-477420-h3", googleClientId: "174209487989-e09fq602et8pvn9ooaj0pqpj6t4ubd04.apps.googleusercontent.com" } }, "public, max-age=3600, s-maxage=3600");
    if (p.startsWith("/api/")) return json(503, { error: "This feature is temporarily unavailable.", code: "unavailable" });
    return serveAsset(request, env, p);
  },
};

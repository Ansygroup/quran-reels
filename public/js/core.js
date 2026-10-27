/* ============================================================
   قرآن ريلز — أدوات نواة: حسابات، تحويلات، مساعدات
   ============================================================ */

/* ---------- DOM ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, attrs = {}, html = "") => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "dataset") Object.assign(e.dataset, v);
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== null && v !== false && v !== undefined) e.setAttribute(k, v);
  }
  if (html) e.innerHTML = html;
  return e;
};
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- تخزين محلي ---------- */
const store = {
  get(k, def = null) {
    try { const v = localStorage.getItem("qr_" + k); return v === null ? def : JSON.parse(v); }
    catch { return def; }
  },
  set(k, v) { try { localStorage.setItem("qr_" + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem("qr_" + k); } catch {} },
};

/* ---------- إشعارات/تنبيهات ---------- */
function toast(msg, type = "ok") {
  let wrap = $(".toast-wrap");
  if (!wrap) { wrap = el("div", { class: "toast-wrap" }); document.body.appendChild(wrap); }
  const t = el("div", { class: "toast" + (type === "err" ? " err" : "") }, esc(msg));
  wrap.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = ".4s"; setTimeout(() => t.remove(), 420); }, 3400);
}

/* ---------- أرقام وعربية ---------- */
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const toAr = n => String(n).replace(/\d/g, d => AR_DIGITS[d]);
const pad = (n, w = 3) => String(n).padStart(w, "0");
const fmtTime = h => {
  if (h == null || isNaN(h)) return "--:--";
  h = ((h % 24) + 24) % 24;
  let hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  if (mm === 60) { mm = 0; hh = (hh + 1) % 24; }
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};
const fmtClock = d => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/* ---------- تطبيع عربي للبحث ---------- */
function normAr(s) {
  return String(s || "")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "")
    .replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim().toLowerCase();
}

/* ---------- تاريخ هجري (يعتمد على Intl) ---------- */
/* مُنسّق واحد مخزّن — إنشاؤه في كل استدعاء كان يُجمّد الحلقات (hijriToGreg ×900) */
const _HIJRI_FMT = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", {
  day: "numeric", month: "numeric", year: "numeric", weekday: "long",
});
function hijriParts(date = new Date()) {
  try {
    const parts = _HIJRI_FMT.formatToParts(date);
    const get = t => parts.find(p => p.type === t)?.value;
    return {
      day: +get("day"), month: +get("month"), year: +get("year"),
      weekday: parts.find(p => p.type === "weekday")?.value || "",
      raw: fmt.format(date),
    };
  } catch (e) {
    return { day: 1, month: 1, year: 1448, weekday: "", raw: "١ محرم ١٤٤٨ هـ" };
  }
}
/** نص التاريخ الهجري مع "هـ" موحدًا (يمنع التكرار) */
function hijriLabel(h) {
  return String(h?.raw || "").replace(/\s*هـ\s*$/, "").trim() + " هـ";
}
const HIJRI_MONTHS = ["محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"];
const gregMonths = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

/** هجري → ميلادي (بحث تقريبي ± يوم) */
function hijriToGreg(hy, hm, hd) {
  const today = new Date();
  const base = new Date(today.getFullYear() - 1, 0, 1);
  for (let i = 0; i < 900; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    const p = hijriParts(d);
    if (p.year === hy && p.month === hm && p.day === hd) return d;
    if (p.year > hy + 1) break;
  }
  return null;
}
/** ميلادي → هجري */
const gregToHijri = hijriParts;

/* ============================================================
   حساب مواقيت الصلاة (خوارزمية أم القرى/رابطة العالم الإسلامي)
   ============================================================ */
const PRAY_METHODS = {
  MWL: { n: "رابطة العالم الإسلامي (MWL)", fajr: 18, isha: 17 },
  Egyptian: { n: "الهيئة المصرية العامة للمساحة", fajr: 19.5, isha: 17.5 },
  UmmAlQura: { n: "أم القرى — مكة المكرمة", fajr: 18.5, ishaMin: 90 },
  Makkah: { n: "أم القرى — مكة المكرمة", fajr: 18.5, ishaMin: 90 },
  Karachi: { n: "جامعة العلوم الإسلامية — كراتشي", fajr: 18, isha: 18 },
  ISNA: { n: "أمريكا الشمالية (ISNA)", fajr: 15, isha: 15 },
  Gulf: { n: "دول الخليج", fajr: 19.5, ishaMin: 90 },
  Tehran: { n: "طهران", fajr: 17.7, isha: 14 },
  Kuwait: { n: "الكويت", fajr: 18, ishaMin: 17.5 },
  Qatar: { n: "قطر", fajr: 18, ishaMin: 90 },
  Singapore: { n: "سنغافورة", fajr: 20, isha: 18 },
  Turkey: { n: "تركيا (ديانت)", fajr: 18, isha: 17 },
};

const PrayTimes = (() => {
  const dtr = d => (d * Math.PI) / 180, rtd = r => (r * 180) / Math.PI;
  const sin = d => Math.sin(dtr(d)), cos = d => Math.cos(dtr(d)), tan = d => Math.tan(dtr(d));
  const arcsin = x => rtd(Math.asin(x)), arccos = x => rtd(Math.acos(x));
  const arctan2 = (y, x) => rtd(Math.atan2(y, x));
  const arccot = x => rtd(Math.atan(1 / x));
  const fixAngle = a => ((a % 360) + 360) % 360;
  const fixHour = a => ((a % 24) + 24) % 24;

  function julian(y, m, d) {
    if (m <= 2) { y -= 1; m += 12; }
    const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
  }
  function sunPosition(jd) {
    const D = jd - 2451545.0;
    const g = fixAngle(357.529 + 0.98560028 * D);
    const q = fixAngle(280.459 + 0.98564736 * D);
    const L = fixAngle(q + 1.915 * sin(g) + 0.020 * sin(2 * g));
    const e = 23.439 - 0.00000036 * D;
    const RA = fixHour(arctan2(cos(e) * sin(L), cos(L)) / 15);
    const eqt = q / 15 - RA;
    const decl = arcsin(sin(e) * sin(L));
    return { declination: decl, equation: eqt };
  }

  /**
   * @param {number} lat  خط العرض
   * @param {number} lng  خط الطول
   * @param {number} tz   فرق التوقيت عن غرينتش (بالساعات)
   * @param {string} method مفتاح الطريقة
   * @param {string} asr 'standard' | 'hanafi'
   * @param {Date} date
   */
  function compute({ lat, lng, tz, method = "UmmAlQura", asr: asrMode = "standard", date = new Date() }) {
    const P = PRAY_METHODS[method] || PRAY_METHODS.UmmAlQura;
    const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
    const jDate = julian(y, m, d) - lng / (15 * 24);
    const asrFactor = asrMode === "hanafi" ? 2 : 1;
    const adjust = -lng / 15 + tz; // ضبط محلي

    function midDay(t) {
      const eqt = sunPosition(jDate + t).equation;
      return fixHour(12 - eqt);
    }
    function sunAngleTime(angle, t, ccw) {
      const decl = sunPosition(jDate + t).declination;
      const noon = midDay(t);
      const num = -sin(angle) - sin(decl) * sin(lat);
      const den = cos(decl) * cos(lat);
      let x = num / den;
      x = Math.max(-1, Math.min(1, x));
      const T = arccos(x) / 15;
      return noon + (ccw ? -T : T);
    }
    function asrTime(t) {
      const decl = sunPosition(jDate + t).declination;
      const angle = -arccot(asrFactor + tan(Math.abs(lat - decl)));
      return sunAngleTime(angle, t, false);
    }

    // اقتراحات أولية ثم تكرار
    let fajr = sunAngleTime(P.fajr, 5 / 24, true);
    let sunrise = sunAngleTime(0.833, 6 / 24, true);
    let dhuhr = midDay(12 / 24);
    let asr = asrTime(13 / 24);
    let sunset = sunAngleTime(0.833, 18 / 24, false);
    let isha;
    if (P.ishaMin != null) isha = null;
    else isha = sunAngleTime(P.isha, 18 / 24, false);

    for (let i = 0; i < 2; i++) {
      fajr = sunAngleTime(P.fajr, fajr / 24, true);
      sunrise = sunAngleTime(0.833, sunrise / 24, true);
      dhuhr = midDay(dhuhr / 24);
      asr = asrTime(asr / 24);
      sunset = sunAngleTime(0.833, sunset / 24, false);
      if (P.isha != null) isha = sunAngleTime(P.isha, isha / 24, false);
    }
    const maghrib = sunset;
    const ishaT = P.ishaMin != null ? maghrib + P.ishaMin / 60 : isha;

    const toLocal = t => t + adjust;
    const times = {
      fajr: toLocal(fajr), sunrise: toLocal(sunrise), dhuhr: toLocal(dhuhr),
      asr: toLocal(asr), maghrib: toLocal(maghrib), sunset: toLocal(sunset),
      isha: toLocal(ishaT),
    };
    times.imsak = times.fajr;
    return times;
  }
  return { compute };
})();

/* ---------- اتجاه القبلة ---------- */
function qiblaBearing(lat, lng) {
  const K_LAT = 21.4225, K_LNG = 39.8262;
  const dl = dtr(K_LNG - lng);
  const y = Math.sin(dl);
  const x = Math.cos(dtr(lat)) * Math.tan(dtr(K_LAT)) - Math.sin(dtr(lat)) * Math.cos(dl);
  let b = rtd(Math.atan2(y, x));
  return (b + 360) % 360;
}
const dtr = d => (d * Math.PI) / 180, rtd = r => (r * 180) / Math.PI;
function distKm(lat1, lon1, lat2, lon2) {
  const R = 6371, p = dtr(lat2 - lat1), q = dtr(lon2 - lon1);
  const a = Math.sin(p / 2) ** 2 + Math.cos(dtr(lat1)) * Math.cos(dtr(lat2)) * Math.sin(q / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}
function kaabaDistance(lat, lng) { return distKm(lat, lng, 21.4225, 39.8262); }

/* ---------- مواقع جاهزة (اختيار سريع) ---------- */
const CITIES = [
  { n: "القاهرة، مصر", lat: 30.0444, lng: 31.2357, tz: 2 },
  { n: "الإسكندرية، مصر", lat: 31.2001, lng: 29.9187, tz: 2 },
  { n: "الرياض، السعودية", lat: 24.7136, lng: 46.6753, tz: 3 },
  { n: "مكة المكرمة، السعودية", lat: 21.3891, lng: 39.8579, tz: 3 },
  { n: "المدينة المنورة، السعودية", lat: 24.5247, lng: 39.5692, tz: 3 },
  { n: "جدة، السعودية", lat: 21.4858, lng: 39.1925, tz: 3 },
  { n: "دبي، الإمارات", lat: 25.2048, lng: 55.2708, tz: 4 },
  { n: "أبوظبي، الإمارات", lat: 24.4539, lng: 54.3773, tz: 4 },
  { n: "الدوحة، قطر", lat: 25.2854, lng: 51.531, tz: 3 },
  { n: "الكويت، الكويت", lat: 29.3759, lng: 47.9774, tz: 3 },
  { n: "المنامة، البحرين", lat: 26.2285, lng: 50.586, tz: 3 },
  { n: "مسقط، عُمان", lat: 23.588, lng: 58.3829, tz: 4 },
  { n: "عمّان، الأردن", lat: 31.9454, lng: 35.9284, tz: 3 },
  { n: "القدس، فلسطين", lat: 31.7683, lng: 35.2137, tz: 2 },
  { n: "غزة، فلسطين", lat: 31.5017, lng: 34.4668, tz: 2 },
  { n: "بيروت، لبنان", lat: 33.8938, lng: 35.5018, tz: 3 },
  { n: "دمشق، سوريا", lat: 33.5138, lng: 36.2765, tz: 3 },
  { n: "بغداد، العراق", lat: 33.3152, lng: 44.3661, tz: 3 },
  { n: "الخرطوم، السودان", lat: 15.5007, lng: 32.5599, tz: 2 },
  { n: "طرابلس، ليبيا", lat: 32.8872, lng: 13.1913, tz: 2 },
  { n: "تونس، تونس", lat: 36.8065, lng: 10.1815, tz: 1 },
  { n: "الجزائر، الجزائر", lat: 36.7538, lng: 3.0588, tz: 1 },
  { n: "الرباط، المغرب", lat: 34.0209, lng: -6.8416, tz: 1 },
  { n: "الدار البيضاء، المغرب", lat: 33.5731, lng: -7.5898, tz: 1 },
  { n: "نواكشوط، موريتانيا", lat: 18.0735, lng: -15.9582, tz: 0 },
  { n: "إسطنبول، تركيا", lat: 41.0082, lng: 28.9784, tz: 3 },
  { n: "لندن، بريطانيا", lat: 51.5074, lng: -0.1278, tz: 0 },
  { n: "باريس، فرنسا", lat: 48.8566, lng: 2.3522, tz: 1 },
  { n: "برلين، ألمانيا", lat: 52.52, lng: 13.405, tz: 1 },
  { n: "نيويورك، أمريكا", lat: 40.7128, lng: -74.006, tz: -5 },
  { n: "تورونتو، كندا", lat: 43.6532, lng: -79.3832, tz: -5 },
  { n: "كوالالمبور، ماليزيا", lat: 3.139, lng: 101.6869, tz: 8 },
  { n: "جاكرتا، إندونيسيا", lat: -6.2088, lng: 106.8456, tz: 7 },
  { n: "إسلام آباد، باكستان", lat: 33.6844, lng: 73.0479, tz: 5 },
  { n: "دلهي، الهند", lat: 28.7041, lng: 77.1025, tz: 5.5 },
];

/* ---------- حساب مواقيت لموقع ---------- */
function timesFor({ lat, lng, tz, method, asr }, date = new Date()) {
  return PrayTimes.compute({ lat, lng, tz, method, asr, date });
}
const PRAY_KEYS = [
  { k: "fajr", n: "الفجر", ic: "🌄" },
  { k: "sunrise", n: "الشروق", ic: "☀️" },
  { k: "dhuhr", n: "الظهر", ic: "🌞" },
  { k: "asr", n: "العصر", ic: "🌤️" },
  { k: "maghrib", n: "المغرب", ic: "🌇" },
  { k: "isha", n: "العشاء", ic: "🌙" },
];

/* ---------- أدوات الزمن ---------- */
/** تحويل اسم منطقة IANA إلى فارق ساعات (يراعي التوقيت الصيفي تلقائيًا) */
function tzFromName(name, fallback = 0) {
  if (!name) return fallback;
  try {
    const p = new Intl.DateTimeFormat("en-US", {
      timeZone: name, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date()).reduce((a, x) => (a[x.type] = x.value, a), {});
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, p.hour === "24" ? 0 : +p.hour, +p.minute, +p.second);
    return Math.round((asUTC - Date.now()) / 60000) / 60;
  } catch { return fallback; }
}

/** الساعة الكسرية "الآن" بتوقيت مدينة/منطقة معيّنة (لمقارنات المواقيت) */
function nowHoursIn(tz = 0) {
  let h = (Date.now() / 3600000) % 24 + tz;
  h = ((h % 24) + 24) % 24;
  return h;
}

/* ---------- موقع المستخدم (محلي ثم IP) ---------- */
async function detectLocation() {
  const saved = store.get("loc");
  if (saved && typeof saved.lat === "number") return { ...saved, source: "saved" };
  const geo = await new Promise(res => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => res(null), { timeout: 7000, maximumAge: 600000 }
    );
  });
  if (geo) {
    const loc = { ...geo, tz: -new Date().getTimezoneOffset() / 60, n: "موقعي الحالي" };
    store.set("loc", loc); return { ...loc, source: "geo" };
  }
  try {
    const r = await fetch("/api/ip"); const j = await r.json();
    if (typeof j.latitude === "number") {
      const devTz = -new Date().getTimezoneOffset() / 60;
      const loc = { lat: j.latitude, lng: j.longitude, tz: tzFromName(j.timezone, devTz), n: (j.city || j.country_name || "موقعك"), source: "ip" };
      store.set("loc", loc); return loc;
    }
  } catch {}
  return { ...CITIES[0], source: "default" };
}

/* ---------- التنقل (Hash router) ---------- */
const Router = {
  routes: {},
  on(hash, fn) { this.routes[hash] = fn; return this; },
  go(hash) { location.hash = hash; },
  current() { return location.hash || "#/"; },
  async handle() {
    const h = location.hash || "#/";
    const parts = h.replace(/^#\//, "").split("/");
    const key = (parts[0] || "home").split("?")[0];
    try { window.scrollTo(0, 0); } catch {}
    $("#mainNav")?.classList.remove("open");
    // إخفاء كل المناظر
    $$(".view").forEach(v => (v.hidden = true));
    if (key === "tools") {
      $("#view-tools").hidden = false;
      document.title = "الأدوات الإسلامية — قرآن ريلز";
      if (this.routes["tools"]) this.routes["tools"]();
    } else if (key === "tool" && parts[1]) {
      $("#view-tool").hidden = false;
      if (this.routes["tool"]) this.routes["tool"](parts[1]);
    } else if (key === "privacy") {
      $("#view-privacy").hidden = false;
    } else if (key === "account") {
      $("#view-account").hidden = false;
      document.title = "حسابي والنشر التلقائي — قرآن ريلز";
      if (this.routes["account"]) this.routes["account"]((parts[0] || "").split("?")[1] || "");
    } else {
      $("#view-home").hidden = false;
      if (this.routes["home"]) this.routes["home"]();
      // تمرير لمرساة إن وجدت
      const anchor = (parts[0] || "").startsWith("a:") ? parts[0].slice(2) : null;
      if (anchor) setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth" }), 60);
    }
    // تحديث زر النشط
    $$(".nav a").forEach(a => a.classList.toggle("active", a.getAttribute("href") === h || (h === "#/" && a.dataset.home === "1")));
    $(".nav")?.classList.remove("open");
  },
  start() {
    window.addEventListener("hashchange", () => this.handle());
    this.handle();
  },
};

/* ---------- عناصر مشتركة ---------- */
function accordionify(root) {
  $$(".faq-item", root).forEach(item => {
    const q = $(".faq-q", item), a = $(".faq-a", item);
    if (!q || !a) return;
    q.addEventListener("click", () => {
      const open = item.classList.toggle("open");
      a.style.maxHeight = open ? a.scrollHeight + "px" : "0";
    });
  });
}

function confirmDialog(title, text, okText = "متابعة") {
  return new Promise(res => {
    const ov = el("div", { class: "overlay" });
    ov.innerHTML = `<div class="modal" style="position:relative">
      <div style="font-size:2rem">⚠️</div>
      <h3>${esc(title)}</h3><p>${esc(text)}</p>
      <div class="result-actions">
        <button class="btn btn-gold" data-ok>${esc(okText)}</button>
        <button class="btn btn-ghost" data-cancel>إلغاء</button>
      </div></div>`;
    document.body.appendChild(ov);
    ov.querySelector("[data-ok]").onclick = () => { ov.remove(); res(true); };
    ov.querySelector("[data-cancel]").onclick = () => { ov.remove(); res(false); };
  });
}

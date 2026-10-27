/* ============================================================
   قرآن ريلز — محرك النص القرآني والتحميل
   ============================================================ */
const Quran = {
  data: null,          // النص العثماني
  surahs: [],          // معلومات السور
  translations: {},    // { id: Map("s:a" -> نص) }
  _loading: null,

  async load() {
    if (this.data) return this.data;
    if (this._loading) return this._loading;
    this._loading = (async () => {
      const r = await fetch("data/quran-uthmani.json");
      const j = await r.json();
      this.data = j.data;
      this.surahs = this.data.surahs.map(s => ({
        n: s.number, name: s.name, en: s.englishName, type: s.revelationType,
        count: s.numberOfAyahs || s.ayahs.length, ayat: s.ayahs,
      }));
      return this.data;
    })();
    return this._loading;
  },

  surah(n) { return this.surahs[n - 1]; },
  ayah(s, a) { return this.surah(s)?.ayat[a - 1]?.text || ""; },
  ayahCount(s) { return this.surah(s)?.count || 0; },

  /** نص مجموعة آيات */
  range(s, from, to) {
    const sur = this.surah(s); if (!sur) return "";
    from = Math.max(1, Math.min(from, sur.count));
    to = Math.max(from, Math.min(to ?? from, sur.count));
    const out = [];
    for (let a = from; a <= to; a++) out.push(sur.ayat[a - 1].text);
    return out;
  },

  /** تحميل ترجمة (أول استخدام) */
  async loadTranslation(id) {
    if (id === "none" || id === "ar") return null;
    if (this.translations[id]) return this.translations[id];
    const r = await fetch(`data/tr-${id}.json`);
    const j = await r.json();
    const map = new Map();
    for (const s of j.data.surahs)
      for (const a of s.ayahs) map.set(s.number + ":" + a.numberInSurah, a.text);
    this.translations[id] = map;
    return map;
  },

  trText(id, s, a) {
    return this.translations[id]?.get(s + ":" + a) || "";
  },

  /** أقصر صيغة لاسم السورة */
  shortName(s) {
    const name = this.surah(s)?.name || "";
    return name.replace(/^سُورَةُ?\s*/, "").replace(/^سورة\s*/, "");
  },
};

/* ---------- بنية المقطع المختار ---------- */
const Selection = {
  surah: 112, from: 1, to: 4,
  reciter: "Alafasy_128kbps",
  translation: "none",
  bg: "bg-mosque-night",
  dedMode: "none", dedText: "",
  accent: "gold", showWatermark: true, motion: true,
  ratio: "9:16", quality: 1080, fontSize: 100, showTrans: true, style: "card",

  list() {
    const out = [];
    for (let a = this.from; a <= this.to; a++) out.push({ s: this.surah, a });
    return out;
  },
  count() { return Math.max(0, this.to - this.from + 1); },
  restore() {
    const s = store.get("sel");
    if (s) Object.assign(this, s);
  },
  save() {
    store.set("sel", {
      surah: this.surah, from: this.from, to: this.to, reciter: this.reciter,
      translation: this.translation, bg: this.bg, dedMode: this.dedMode, dedText: this.dedText,
      accent: this.accent, showWatermark: this.showWatermark, motion: this.motion,
      ratio: this.ratio, quality: this.quality, fontSize: this.fontSize, showTrans: this.showTrans, style: this.style,
    });
  },
};

/* ---------- آية اليوم (ثابتة حسب اليوم) ---------- */
const DAILY_AYAHS = [
  [2, 152], [2, 155], [2, 255], [3, 8], [3, 139], [3, 173], [3, 190],
  [5, 2], [6, 59], [7, 89], [9, 51], [9, 105], [10, 57], [11, 88],
  [12, 87], [13, 28], [14, 7], [15, 49], [16, 97], [17, 20],
  [18, 10], [19, 30], [20, 114], [21, 87], [23, 118], [24, 35],
  [25, 74], [26, 88], [28, 24], [29, 45], [30, 21], [31, 14],
  [33, 41], [35, 28], [36, 58], [39, 10], [39, 53], [40, 60],
  [41, 34], [42, 3], [48, 4], [51, 21], [54, 17], [55, 13],
  [57, 3], [58, 11], [59, 22], [62, 10], [64, 15], [65, 2],
  [65, 3], [66, 8], [67, 2], [68, 35], [73, 20], [76, 25],
  [78, 33], [87, 19], [88, 21], [89, 27], [93, 5], [94, 5],
  [95, 4], [97, 1], [99, 7], [102, 2], [103, 1], [107, 1],
  [108, 1], [109, 6], [110, 1], [112, 1], [113, 1], [114, 1],
];
function dailyAyah(offsetDays = 0) {
  const d = new Date(); d.setDate(d.getDate() + offsetDays);
  const key = d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate();
  const [s, a] = DAILY_AYAHS[key % DAILY_AYAHS.length];
  return { s, a, text: Quran.ayah(s, a), surah: Quran.shortName(s) };
}

/* ---------- فهرس بحث سريع في آيات القرآن (يبني عند أول طلب) ---------- */
const QuranIndex = {
  _idx: null,
  build() {
    if (this._idx) return this._idx;
    const idx = [];
    for (const sur of Quran.data.surahs)
      for (const a of sur.ayahs)
        idx.push({ s: sur.number, a: a.numberInSurah, t: a.text, n: normAr(a.text) });
    this._idx = idx;
    return idx;
  },
  search(q, limit = 40) {
    const nq = normAr(q);
    if (!nq) return [];
    const terms = nq.split(" ").filter(Boolean);
    const idx = this.build();
    const out = [];
    for (const row of idx) {
      let score = 0, ok = true;
      for (const t of terms) {
        if (row.n.includes(t)) score += t.length;
        else { ok = false; break; }
      }
      if (ok) out.push({ ...row, score });
    }
    out.sort((a, b) => b.score - a.score || a.s - b.s || a.a - b.a);
    return out.slice(0, limit);
  },
  /** بحث في موضوعات جاهزة + نص حر */
  topicSearch(topic, extraQ = "") {
    const keys = TOPICS[topic] || [];
    const refs = [];
    if (keys.length) {
      const idx = this.build();
      const normKeys = keys.map(normAr);
      for (const row of idx) {
        for (const k of normKeys) {
          if (row.n.includes(k)) { refs.push({ s: row.s, a: row.a, t: row.t }); break; }
        }
        if (refs.length >= 60) break;
      }
    }
    if (extraQ) {
      for (const r of this.search(extraQ, 30)) refs.push({ s: r.s, a: r.a, t: r.t });
    }
    // إزالة المكرر مع الحفاظ على الترتيب
    const seen = new Set();
    return refs.filter(r => {
      const k = r.s + ":" + r.a;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
  },
};

/* ---------- صياغة مرجع آية ---------- */
function ayahRef(s, a, b) {
  const name = Quran.shortName(s);
  return b && b !== a ? `${name} ${toAr(a)}–${toAr(b)}` : `${name} ${toAr(a)}`;
}

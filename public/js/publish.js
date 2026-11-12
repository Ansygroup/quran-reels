/* ============================================================
   قرآن ريلز — QuranReels Pro  |  Publish / Account UI (v9.1)
   ------------------------------------------------------------
   كان هذا الملف يحتوي (بالخطأ) كود خادم: require(...) و module.exports،
   وهو ما جعل المتصفح يفشل بـ ReferenceError: require is not defined وتتعطّل
   لوحة الحساب بالكامل. منطق الخادم موجود أصلًا — ولا حاجة لتكراره — في
   api/autopilot.js (نفس استجابة accountData) و api/_publish.js (النشر الفوري).
   الحاجز tests/functions_limit.js يمنع عودة كود الخادم إلى public/.
   ============================================================ */

// خرائط المنصات (مطابقة لمفتاح api/autopilot.js)
const PLATFORMS = {
  youtube: "يوتيوب",
  facebook: "فيسبوك",
  instagram: "إنستغرام",
  tiktok: "تيك توك",
  x: "X",
  linkedin: "لينكد إن",
  telegram: "تيليجرام",
  whatsapp: "واتساب",
};
const ALL_PLATFORMS = Object.keys(PLATFORMS);

/* ============================================================
 * الربط عبر OAuth — كان غائبًا عن الواجهة بالكامل
 * ------------------------------------------------------------
 * الخادم كان يملك المسارات الأربعة جاهزة (op=start/list/disconnect في
 * api/gw.js) لكن لا يوجد زر واحد في أي صفحة يستدعيها، فلم يكن ممكنًا
 * ربط أي قناة من الموقع إطلاقًا. هنا نبني رابط البدء ونعرض حالة كل منصة.
 * facebook وinstagram يتشاركان تطبيق Meta واحد، و/أو يُقبل الاسمان أيضًا.
 * ============================================================ */
const CONNECT_PLATFORM = { youtube: "youtube", facebook: "meta", instagram: "meta", tiktok: "tiktok", x: "x" };

function connectPath(platform, token) {
  const prov = CONNECT_PLATFORM[String(platform || "").toLowerCase()];
  if (!prov || !token) return null;
  return `/api/gw?op=start&p=${prov}&t=${encodeURIComponent(token)}`;
}

/* توقيت القاهرة — يقبل تاريخًا/وقتًا كاملًا أو "HH:MM(:SS)" ويُعيد نصًا عربيًا */
function cairoClockLabel(v) {
  try {
    if (typeof v === "string" && /^\d{1,2}:\d{2}(:\d{2})?$/.test(v.trim())) {
      const [h, m] = v.trim().split(":");
      const d = new Date(Date.UTC(2000, 0, 1, Number(h), Number(m)));
      return d.toLocaleTimeString("ar-EG", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" }) + " (القاهرة)";
    }
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return String(v || "");
    return d.toLocaleString("ar-EG", { timeZone: "Africa/Cairo", dateStyle: "short", timeStyle: "short" });
  } catch { return String(v || ""); }
}

/* جسر المصادقة: الوحدة الفعلية في المشروع اسمها QRAuth (public/js/auth.js) */
window.AuthApp = window.AuthApp || {
  getUserId() {
    try { return (typeof QRAuth !== "undefined" && QRAuth.user() ? QRAuth.user().id : null); }
    catch { return null; }
  },
  async getToken() {
    try { return (typeof QRAuth !== "undefined") ? await QRAuth.token() : null; }
    catch { return null; }
  },
};

// واجهة العميل (تحديثات التوازي وتعدد القنوات والمقالات)
window.PublishApp = {
  PLATFORMS: ALL_PLATFORMS,
  PLATFORMS_MAP: PLATFORMS,
  cairoClockLabel,
  connectPath,
  CONNECT_PLATFORM,
  
  async init() {
    const uid = await window.AuthApp.getUserId();
    if (!uid) {
      // لا نُخرج المستخدم من الصفحة: نفتح نافذة الدخول ونوضّح المطلوب.
      window.QRAuthUI?.open();
      const notice = document.getElementById("acctNotice");
      if (notice) {
        notice.hidden = false;
        notice.style.display = "block";
        notice.textContent = "سجّل الدخول لعرض لوحة النشر والأتمتة — بريدك + رابط سحري، أو جوجل.";
      }
      return;
    }
    
    // تحميل البيانات
    const res = await fetch("/api/autopilot", { method: "GET", headers: { Authorization: `Bearer ${await window.AuthApp.getToken()}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) {
        const notice = document.getElementById("acctNotice");
        if (notice) { notice.hidden = false; notice.textContent = "سجّل الدخول (من زر الحساب بالأعلى) لعرض لوحة النشر والأتمتة."; }
        return;
      }
      alert(data.error || "خطأ في تحميل البيانات");
      return;
    }
    
    this.renderAccount(data);
    this.bindEvents(uid);
    this.startProgressPolling();
    // حالة الربط الحقيقية — تُقرأ من op=list (الخادم لا يرسل التوكنات أبدًا)
    await this.renderConnections(await window.AuthApp.getToken());
    this.reportLinkedFlag();
  },

  /* ============================================================
   * رسم لوحة «حسابي» — تصميم جديد (بطاقة حالة + خطوات + أرقام +
   * تخصيص قابل للتعديل + سجل + تشخيص).
   * كل الأجزاء تُبنى من نفس استجابة /api/autopilot، والنصوص تُهرَّب.
   * ============================================================ */
  esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  },

  safeUrl(v) {
    try { const u = new URL(String(v)); return ["http:", "https:"].includes(u.protocol) ? u.href : ""; }
    catch { return ""; }
  },

  /* ترجمة الأسباب الخام (صفوف كُتبت قبل G44) إلى جملة مفهومة */
  friendly(v) {
    const t = String(v || "");
    if (/invalid_grant|expired or revoked|unauthorized_client/i.test(t)) {
      return "انتهت صلاحية ربط " + (/tiktok/i.test(t) ? "تيك توك" : /\bx\b|twitter/i.test(t) ? "X" : "يوتيوب") + " — أعد الربط من بطاقة القنوات";
    }
    if (/quotaExceeded|exceeded your quota/i.test(t)) return "تجاوز الحد اليومي للرفع على يوتيوب — راجع النتيجة قبل إعادة المحاولة";
    return t;
  },

  /* موعد التشغيل القادم: 04:15 UTC = 06:15 القاهرة، كل يوم */
  nextRunInfo(now = Date.now()) {
    const d = new Date(now);
    const at = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 4, 15, 0, 0));
    if (at.getTime() <= now) at.setUTCDate(at.getUTCDate() + 1);
    return { at, inMs: at.getTime() - now };
  },

  humanGap(ms) {
    const mins = Math.max(0, Math.round(ms / 60000));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (!h) return `${m} دقيقة`;
    return m ? `${h} ساعة و${m} دقيقة` : `${h} ساعة`;
  },

  articleLabel(data) {
    const n = data && data.articles && Number(data.articles.count) > 0 ? Number(data.articles.count) : 0;
    return n ? `📚 توليد من مقال (${n.toLocaleString("ar-EG")} مقال)` : "📚 توليد من مقال";
  },

  /* ---------- سطر آخر تشغيل آلي ---------- */
  dailyLine(d) {
    if (!d || !d.run_date) return "";
    const day = String(d.run_date).slice(0, 10);
    const published = d.status === "published";
    const running = d.status === "rendering";
    const state = published ? "✅ منشور" : running ? "⏳ قيد التوليد" : "⚠️ فشل";
    const why = !published && !running && d.error ? " — " + this.friendly(String(d.error).slice(0, 140)) : "";
    const link = published && this.safeUrl(d.external_url)
      ? ` · <a href="${this.esc(this.safeUrl(d.external_url))}" target="_blank" rel="noopener">رابط المنشور</a>` : "";
    return `<p class="hint ${published ? "ok" : running ? "" : "warn"}" id="acctLastDaily">آخر تشغيل آلي (${this.esc(day)}): ${state}${this.esc(why)}${link} · تُجدول محاولة يومية 04:15 UTC</p>`;
  },

  /* ---------- سطر آخر فحص محفوظ ---------- */
  checkLine(c) {
    if (!c || !c.created_at) return "";
    const when = new Date(c.created_at);
    const stamp = Number.isNaN(when.getTime()) ? "" : when.toISOString().slice(0, 16).replace("T", " ") + " UTC";
    const kind = c.kind === "render_selftest_deep" ? "توليد تجريبي"
      : c.kind === "render_failure" ? "محاولة توليد آلية"
      : c.kind === "autopilot_daily" ? "تشغيل آلي" : "فحص المحرّك";
    let why = !c.ok && c.detail && c.detail.error ? " — " + this.friendly(String(c.detail.error).slice(0, 120)) : "";
    const d = c.detail || {};
    if (!c.ok && !why && d.audio_direct && d.audio_direct.ok === false) {
      why = " — التلاوة غير متاحة من الخادم" + (d.audio_proxy && d.audio_proxy.ok ? " (المسار المباشر فقط)" : "");
    }
    if (!c.ok && d.export && d.export.stage && !/stage/.test(why)) {
      why += (why ? " · " : " — ") + "توقّف عند «" + String(d.export.stage).slice(0, 60) + "»";
    }
    return `<p class="hint ${c.ok ? "ok" : "warn"}" id="acctLastCheck">آخر ${kind} محفوظ: ${c.ok ? "✅ ناجح" : "⚠️ فاشل"}${this.esc(why)} · ${stamp}</p>`;
  },

  /* ---------- تفاصيل آخر فشل توليد ---------- */
  diagBox(c) {
    const d = c && c.kind === "render_failure" && c.detail && c.detail.diag ? c.detail.diag : null;
    if (!d) return "";
    const last = d.last && typeof d.last === "object" ? d.last : {};
    const stop = d.kind === "stall" ? "توقّف بلا تقدّم" : d.kind === "timeout" ? "تجاوز المهلة" : (d.kind || "فشل");
    const rows = [
      ["المرحلة", `${d.stage || "غير معروفة"} (${d.pct || "0%"})`],
      ["نوع التوقّف", stop],
      ["بدأ التصدير؟", last.exporting === true ? "نعم" : last.exporting === false ? "لا" : "غير معروف"],
      ["الآيات المحددة", last.count == null ? "غير معروف" : String(last.count)],
      ["حوار مفتوح", last.dialog ? "نعم" : "لا"],
      ["آخر تنبيه", last.toast || "—"],
      ["سبب إيقاف الدالة", last.abort || "—"],
    ];
    const errs = Array.isArray(d.errors) ? d.errors.slice(0, 3).map(String) : [];
    return `<details class="hint warn" id="acctDiag"><summary>تفاصيل آخر محاولة توليد (اضغط للعرض)</summary><ul>${
      rows.map(([k, v]) => `<li>${this.esc(k)}: ${this.esc(v)}</li>`).join("")
    }${errs.length ? `<li>أخطاء الصفحة: ${this.esc(errs.join(" | "))}</li>` : ""}</ul></details>`;
  },

  /* ---------- تنبيه إعادة الربط + زر نشر الفيديو الجاهز ---------- */
  reauthLineHTML(list) {
    const arr = (Array.isArray(list) ? list : []).filter((p) => typeof p === "string" && p);
    if (!Array.isArray(list)) {
      const raw = `${(this.data && this.data.last_daily && this.data.last_daily.error) || ""} ${(this.data && this.data.last_check && this.data.last_check.detail && this.data.last_check.detail.error) || ""}`;
      if (/invalid_grant|expired or revoked|unauthorized_client/i.test(raw)) {
        arr.push(/tiktok/i.test(raw) ? "tiktok" : /youtube/i.test(raw) ? "youtube" : "youtube");
      }
    }
    if (!arr.length) return "";
    const names = arr.map((p) => this.esc(PLATFORMS[p] || p)).join("، ");
    return `<div class="auto-warning" id="acctReauth">⚠️ ${names}: انتهى ربط القناة — اضغط «🔄 إعادة الربط» في بطاقة القنوات. لو المشكلة انتهاء تصريح يوتيوب، النظام هيحاول ينشر الفيديو الجاهز بعد الربط لو قدر يتحقق إنه آمن.
      <div class="row gap-lg" style="margin-top:10px"><button class="btn btn-gold" id="btnRetryPublish" data-act="retry_publish">🔁 انشر الفيديو الجاهز</button></div></div>`;
  },

  /* ---------- بطاقة الحالة (أعلى الصفحة) ---------- */
  renderStatus(data = {}) {
    const config = data.config || {};
    const enabled = config.enabled === true;
    const conns = Array.isArray(this.connections) ? this.connections : [];
    const reauth = Array.isArray(this.reauth) ? this.reauth : [];
    const dot = document.getElementById("acctDot");
    const label = document.getElementById("acctStateLabel");
    const nextEl = document.getElementById("acctNextRun");
    const toggle = document.getElementById("acctEnabled");
    if (toggle) toggle.checked = enabled;

    const next = this.nextRunInfo();
    const nextTxt = `الموعد المجدول بعد ${this.humanGap(next.inMs)} · ${this.cairoClockLabel(next.at)} القاهرة`;

    let state = "idle", title = "الأتمتة موقوفة", hint = "اضغط الزر لتفعيل النشر اليومي التلقائي";
    if (!conns.length) { state = "idle"; title = "اربط قناة للبدء"; hint = "ما فيش قناة مرتبطة — الأتمتة لا تعمل قبل الربط"; }
    else if (reauth.length) { state = "warn"; title = "يحتاج إعادة ربط: " + reauth.map((p) => PLATFORMS[p] || p).join("، "); hint = "أعد الربط من بطاقة القنوات، وراجع حالة المحاولة الآلية"; }
    else if (enabled) { state = "on"; title = "الأتمتة مفعّلة — محاولة نشر يومية"; hint = nextTxt; }

    if (dot) { dot.className = "acct-dot " + state; }
    if (label) label.textContent = title;
    if (nextEl) nextEl.textContent = hint;
  },

  /* ---------- خطوات التشغيل ---------- */
  renderSteps(data = {}) {
    const wrap = document.getElementById("acctSteps");
    if (!wrap) return;
    const config = data.config || {};
    const conns = Array.isArray(this.connections) ? this.connections : [];
    const platforms = Array.isArray(config.platforms) ? config.platforms : [];
    const steps = [
      { n: 1, t: "اربط قناة", d: "يوتيوب / فيسبوك / إنستغرام / تيك توك / X", done: conns.length > 0 },
      { n: 2, t: "اختر المنصات والمحتوى", d: platforms.length ? platforms.map((p) => PLATFORMS[p] || p).join(" · ") : "لم تُختَر منصة بعد", done: platforms.length > 0 },
      { n: 3, t: "فعّل الأتمتة", d: config.enabled ? "محاولة تلقائية كل يوم 04:15 UTC" : "موقوفة — فعّلها من الزر بالأعلى", done: config.enabled === true },
    ];
    wrap.innerHTML = steps.map((s) => `
      <div class="acct-step ${s.done ? "done" : ""}">
        <span class="n">${s.done ? "✓" : s.n}</span>
        <div><b>${this.esc(s.t)}</b><small>${this.esc(s.d)}</small></div>
      </div>`).join("");
  },

  /* ---------- أرقام الأتمتة ---------- */
  renderKpis(data = {}) {
    const wrap = document.getElementById("acctKpis");
    if (!wrap) return;
    const st = data.stats || {};
    const last = st.last_published_at ? new Date(st.last_published_at) : null;
    const lastTxt = last && !Number.isNaN(last.getTime()) ? this.cairoClockLabel(last) : "—";
    const kpi = (v, l, cls = "") => `<div class="kpi ${cls}"><b>${this.esc(v)}</b><span>${this.esc(l)}</span></div>`;
    wrap.innerHTML =
      kpi(st.published || 0, "منشور (آخر ٢٠٠)") +
      kpi(st.scheduled || 0, "في الطابور (آخر ٢٠٠)") +
      kpi(st.failed || 0, "فشل (آخر ٢٠٠)", (st.failed ? "warn" : "")) +
      kpi(lastTxt, "آخر نشر");
  },

  /* ---------- صناديق اختيار المنصات ---------- */
  renderPlatformChecks(data = {}) {
    const wrap = document.getElementById("acctPlatforms");
    if (!wrap) return;
    const platforms = Array.isArray(data.config?.platforms) ? data.config.platforms : [];
    wrap.innerHTML = this.available.map((p) => `
      <label class="chk" title="${p.publish ? "" : "لا يوجد ربط/نشر لهذه المنصة بعد"}">
        <input type="checkbox" id="plat-${p.key}" data-platform="${p.key}" ${platforms.includes(p.key) ? "checked" : ""}
          ${p.publish ? "" : "disabled"}>
        ${this.esc(p.name)}${p.publish ? "" : " <small>(قريبًا)</small>"}
      </label>`).join("");
  },

  /* ---------- لوحة التخصيص ---------- */
  renderAutoPanel(data = {}) {
    const wrap = document.getElementById("acctAuto");
    if (!wrap) return;
    const config = data.config || {};
    const template = config.template || {};
    const options = data.options || {};
    const articleLabel = this.articleLabel(data);
    const chanCount = new Map();
    for (const c of Array.isArray(this.connections) ? this.connections : []) chanCount.set(c.platform, (chanCount.get(c.platform) || 0) + 1);
    const multi = [...chanCount.values()].some((n) => n > 1);

    const MODES = { mix: "متنوّع (آيات وسور)", famous: "سور مشهورة", sequential: "بالترتيب (مصحف)", article: "من مقال" };
    const BGS = {
      rotate: "تتغيّر تلقائيًا", "grad-emerald": "تدرّج زمردي", "grad-gold": "تدرّج ذهبي", "grad-dawn": "تدرّج الفجر", "grad-night": "تدرّج ليلي",
      "bg-mosque-night": "مسجد ليلًا", "bg-starry-desert": "صحراء بنجوم", "bg-ocean-sunset": "غروب البحر", "bg-forest-rays": "غابة وأشعة",
      "bg-geometric-islamic": "زخرفة إسلامية", "bg-mountains-dawn": "جبال الفجر", "bg-mosque-silhouette": "ظلّ مسجد",
      "bg-garden-tulips": "حديقة", "bg-arabesque-dark": "أرابيسك", "bg-heavenly-clouds": "سحاب",
    };
    const modes = (Array.isArray(options.content_modes) && options.content_modes.length ? options.content_modes : Object.keys(MODES));
    const reciters = Array.isArray(options.reciters) ? options.reciters : (Array.isArray(data.reciters) ? data.reciters : []);
    const bgs = Array.isArray(options.backgrounds) && options.backgrounds.length ? options.backgrounds : Object.keys(BGS);

    wrap.innerHTML = `
      <div class="acct-sec-head">
        <h2>🎛️ التخصيص</h2>
        <span class="hint">كل ما هنا يُحفظ ويُستخدم في التشغيل الآلي القادم — تقدر تغيّره في أي وقت</span>
      </div>
      <div class="acct-grid3">
        <div class="f-group"><label for="selContentMode">محتوى الفيديو</label>
          <select id="selContentMode">${modes.map((m) => `<option value="${this.esc(m)}" ${template.content_mode === m ? "selected" : ""}>${this.esc(MODES[m] || m)}</option>`).join("")}</select>
        </div>
        <div class="f-group"><label for="selReciter">القارئ</label>
          <select id="selReciter">
            <option value="" ${template.reciter_mode !== "fixed" ? "selected" : ""}>تلقائي (يتنوّع كل يوم)</option>
            ${reciters.map((r) => `<option value="${this.esc(r.id)}" ${template.reciter_mode === "fixed" && template.reciter === r.id ? "selected" : ""}>${this.esc(r.name || r.id)}</option>`).join("")}
          </select>
        </div>
        <div class="f-group"><label for="selBackground">الخلفية</label>
          <select id="selBackground">${bgs.map((b) => `<option value="${this.esc(b)}" ${template.background === b ? "selected" : ""}>${this.esc(BGS[b] || b)}</option>`).join("")}</select>
        </div>
      </div>
      <div class="f-group"><label>المنصات التي يُنشر عليها</label><div class="plat-checks" id="acctPlatforms"></div></div>
      ${multi ? `<div class="switch-row">
        <div class="t">انشر على كل القنوات المرتبطة<small>عند التعطيل يُنشر على القناة الافتراضية (⭐) فقط · عندك ${[...chanCount.entries()].filter(([, n]) => n > 1).map(([k, n]) => `${this.esc(PLATFORMS[k] || k)}: ${n}`).join(" · ")}</small></div>
        <label class="switch"><input type="checkbox" id="chkAllChannels" ${config.all_channels ? "checked" : ""}><i></i></label>
      </div>` : ""}
      <div class="row gap-lg acct-actions">
        <button class="btn btn-gold" id="autoSave" data-act="save">💾 حفظ التعديلات</button>
        <button class="btn btn-em" id="autoRun" data-act="run">▶️ تشغيل الآن</button>
      </div>
      <details class="acct-more">
        <summary>خيارات إضافية</summary>
        <div class="row gap-lg acct-actions">
          <button class="btn btn-ghost" id="autoRunAll" data-act="run_all">⚡ على كل القنوات</button>
          <button class="btn btn-ghost" id="autoGenArticle" data-act="article_random">${articleLabel}</button>
        </div>
      </details>
      <p class="hint">«تشغيل الآن» يُنتج فيديو وينشره فورًا (بحد أقصى ٣ مرات يوميًا) — الأتمتة اليومية تعمل حتى لو لم تفتح الموقع.</p>`;

    this.renderPlatformChecks(data);
  },

  /* نعرض فقط المراحل التي سجّلها الخادم وحالة كل صف نشر فعلي. */
  renderProgress(data = {}) {
    const wrap = document.getElementById("acctProgress");
    if (!wrap) return;
    const head = '<div class="acct-sec-head"><h2>📍 مراحل آخر فيديو</h2></div>';
    if (this._progressWaiting) { wrap.innerHTML = head + '<p class="hint">⏳ بنستنى الخادم يبدأ التشغيل ويسجّل أول خطوة…</p>'; return; }
    const r = data.run;
    if (!r) { wrap.innerHTML = head + '<p class="hint">مفيش تشغيل مسجّل لسه.</p>'; return; }
    const labels = { checking: "فحص القنوات والإعدادات", preparing: "تجهيز الفيديو", audio: "فحص التلاوة", export: "إنشاء الفيديو", validating: "فحص الصوت والملف", storage: "حفظ الفيديو", queue: "تجهيز مهام القنوات", publishing: "محاولة النشر على القنوات" };
    const states = { rendering: "⏳ جاري التجهيز", queued: "⏳ تجهيز أو نشر", published: "✅ التشغيل مكتمل", failed: "⚠️ التشغيل ما اكتملش" };
    const events = (Array.isArray(data.events) ? data.events : []).filter(e => labels[e.stage]);
    const steps = events.length ? `<ol class="progress-steps">${events.map((e, i) => `<li>${i === events.length - 1 ? "📍" : "✓"} ${this.esc(labels[e.stage])}</li>`).join("")}</ol>` : `<p class="hint">${data.events_available === false ? "تعذّر قراءة تفاصيل المراحل دلوقتي." : "تفاصيل المراحل مش متاحة للتشغيل ده."}</p>`;
    const targetStates = { scheduled: "في الانتظار", publishing: "جاري النشر", published: "اتنشر", failed: "فشل أو النتيجة محتاجة مراجعة", draft: "مسودة" };
    const targets = Array.isArray(data.targets) ? data.targets : [];
    const channels = targets.length ? `<ul class="progress-channels">${targets.map(t => {
      const name = `${PLATFORMS[t.platform] || t.platform || "منصة"} · ${t.channel || "قناة"}`;
      const link = t.status === "published" && this.safeUrl(t.url) ? ` · <a href="${this.esc(this.safeUrl(t.url))}" target="_blank" rel="noopener">شوف الفيديو</a>` : "";
      return `<li><b>${this.esc(name)}</b>: ${this.esc(targetStates[t.status] || "حالة غير معروفة")}${link}${t.error ? ` — ${this.esc(this.friendly(t.error))}` : ""}</li>`;
    }).join("")}</ul>` : "";
    const warning = data.targets_available === false ? '<p class="hint warn">تعذّر قراءة حالة القنوات دلوقتي.</p>' : data.targets_truncated ? '<p class="hint warn">قائمة القنوات المعروضة ممكن تكون ناقصة.</p>' : "";
    const error = r.status === "failed" && r.error ? `<p class="hint warn">${this.esc(this.friendly(r.error))}</p>` : "";
    const at = events.length && events[events.length - 1].at ? `آخر خطوة مسجّلة: ${this.esc(cairoClockLabel(events[events.length - 1].at))}. ` : "";
    wrap.innerHTML = head + `<p><b>${this.esc(states[r.status] || "حالة غير معروفة")}</b>${r.title ? ` · ${this.esc(r.title)}` : ""}</p>` + steps + channels + warning + error + `<p class="hint">${at}لو الاتصال اتقطع، راجع الحالة قبل ما تشغّل تاني.</p>`;
  },

  startProgressPolling() {
    if (this._progressTimer) clearTimeout(this._progressTimer);
    this.pollProgress();
  },
  async pollProgress() {
    if (this._progressBusy) return;
    this._progressBusy = true;
    try {
      const token = await window.AuthApp.getToken();
      if (!token) throw new Error("no session");
      const res = await fetch("/api/autopilot?progress=1", { method: "GET", cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("unavailable");
      const data = await res.json();
      if (this._progressWaiting && data.run && data.run.id !== this._progressBaseline) this._progressWaiting = false;
      if (data.run?.id) this._lastProgressRunId = data.run.id;
      this.renderProgress(data);
    } catch {
      const wrap = document.getElementById("acctProgress");
      if (wrap) wrap.innerHTML = '<div class="acct-sec-head"><h2>📍 مراحل آخر فيديو</h2></div><p class="hint warn">مش قادرين نحدّث الحالة دلوقتي؛ ده مش معناه إن التشغيل وقف. راجعها قبل ما تشغّل تاني.</p>';
    } finally {
      this._progressBusy = false;
      if (this._progressTimer) clearTimeout(this._progressTimer);
      const view = document.getElementById("view-account");
      if (view && !view.hidden) this._progressTimer = setTimeout(() => this.pollProgress(), 5000);
    }
  },

  /* ---------- سجل التشغيل ---------- */
  renderHistory(runs) {
    const list = document.getElementById("queueList");
    if (!list) return;
    const rows = Array.isArray(runs) ? runs : [];
    if (!rows.length) {
      list.innerHTML = `<p class="hint">لا يوجد سجل بعد — أول تشغيل سيظهر هنا تلقائيًا.</p>`;
      return;
    }
    list.innerHTML = rows.map((r) => {
      const state = r.status === "published" ? "✅ منشور" : r.status === "rendering" ? "⏳ قيد الإنشاء" : "❌ فشل";
      return `<div class="auto-run ${this.esc(r.status || "")}">
        <div class="auto-run-head">
          <span class="auto-run-title">${this.esc(r.title || `سورة ${String(r.recipe_key || "").split(":")[0] || "—"}`)}</span>
          <span class="auto-run-date">${this.esc(this.cairoClockLabel(r.created_at))}</span>
        </div>
        <div class="auto-run-body">
          <span class="auto-run-reciter">${this.esc(r.reciter || "غير معروف")}</span>
          <span class="auto-run-status">${state}</span>
          ${r.article_title ? `<span class="auto-run-article">📚 ${this.esc(r.article_title)}</span>` : ""}
        </div>
        ${this.safeUrl(r.external_url) ? `<div class="auto-run-url"><a href="${this.esc(this.safeUrl(r.external_url))}" target="_blank" rel="noopener">🔗 رابط النشر</a></div>` : ""}
        ${r.error ? `<div class="auto-run-error">⚠️ ${this.esc(this.friendly(r.error))}</div>` : ""}
      </div>`;
    }).join("");
  },

  /* ---------- بطاقة التشخيص ---------- */
  renderTools(data = {}) {
    const wrap = document.getElementById("acctQuickActions");
    if (!wrap) return;
    wrap.hidden = false;
    wrap.innerHTML = `
      <div class="row gap-lg wrap">
        <button class="btn btn-ghost" id="quickSelfTest" data-act="selftest">🔍 فحص محرّك التوليد</button>
        <button class="btn btn-ghost" id="quickRenderTest" data-act="selftest_deep">🎬 اختبار توليد فيديو</button>
        <button class="btn btn-ghost" id="quickRunAll" data-act="run_all">⚡ تشغيل الكل الآن</button>
        ${this.lastReauthLine ? "" : '<button class="btn btn-ghost" id="btnRetryPublish" data-act="retry_publish">🔁 انشر الفيديو الجاهز</button>'}
      </div>`;
    // نتائج التشغيل والفحص والتنبيهات لا تختفي داخل التشخيص المغلق.
    const alerts = document.getElementById("acctAlerts");
    if (alerts) alerts.innerHTML = `${this.lastDailyLine || ""}${this.lastReauthLine || ""}${this.lastCheckLine || ""}${this.lastDiagBox || ""}`;
  },

  renderAccount(data = {}) {
    this.data = data;
    const runs = Array.isArray(data.runs) ? data.runs : [];
    this.available = Array.isArray(data.available) && data.available.length
      ? data.available
      : ALL_PLATFORMS.map((k) => ({ key: k, name: PLATFORMS[k] || k, publish: true }));
    this.reauth = Array.isArray(data.reauth) ? data.reauth.slice() : [];
    this.lastDailyLine = this.dailyLine(data.last_daily);
    this.lastCheckLine = this.checkLine(data.last_check);
    this.lastDiagBox = this.diagBox(data.last_check);
    this.lastReauthLine = this.reauthLineHTML(data.reauth);

    this.renderStatus(data);
    this.renderSteps(data);
    this.renderKpis(data);
    this.renderAutoPanel(data);
    this.renderHistory(runs);
    this.renderTools(data);
  },

  /* قائمة الحسابات المرتبطة + أزرار ربط/فك ربط لكل منصة */
  async renderConnections(token) {
    const card = document.getElementById("acctAccounts");
    const wrap = document.getElementById("acctAccountsList");
    if (!card || !wrap) return;
    card.hidden = false;
    // نحافظ على القسم المفتوح عند تحديث القنوات بعد ربط أو فك ربط.
    const moreWasOpen = Boolean(wrap.querySelector("#acctMorePlatforms")?.open);
    wrap.innerHTML = '<p class="hint">جارٍ تحميل الحسابات المرتبطة…</p>';

    let conns = [];
    try {
      const res = await fetch("/api/gw?op=list", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      conns = Array.isArray(data.connections) ? data.connections : [];
      if (!res.ok) throw new Error("connections unavailable");
    } catch {
      wrap.innerHTML = '<p class="hint warn">تعذّر تحميل الحسابات المرتبطة. حدّث الصفحة وحاول تاني.</p>';
      return;
    }
    this.connections = conns;

    const ICONS = { youtube: "▶️", facebook: "📘", instagram: "📸", tiktok: "🎵", x: "✖️", linkedin: "💼", telegram: "✈️", whatsapp: "💬" };
    const reauthList = Array.isArray(this.reauth) ? this.reauth : [];
    /* التحذير للحالات الحقيقية فقط: منصة تحتاج إعادة ربط أو اتصال بلا توكن
     * تجديد. صلاحية access_token تنتهي كل ساعة وتُجدَّد تلقائيًا. */
    const expired = (c) => reauthList.includes(c.platform) || c.has_refresh === false;
    const selected = Array.isArray(this.data?.config?.platforms) ? this.data.config.platforms : [];

    const block = (p) => {
      const mine = conns.filter((c) => c.platform === p.key);
      const prov = p.connect || CONNECT_PLATFORM[p.key];
      const ready = p.ready !== false;
      const head = `<div class="chan-head"><span class="chan-ic">${ICONS[p.key] || "🔗"}</span><b>${this.esc(p.name)}</b></div>`;
      const missing = !mine.length && selected.includes(p.key)
        ? '<small class="hint warn">المنصة مختارة للنشر، لكن مفيش قناة مرتبطة بيها.</small>' : "";

      if (mine.length) {
        const one = (c) => {
          const bad = expired(c);
          return `<div class="chan-card ${bad ? "off" : "on"}" data-soc="${this.esc(p.key)}" data-channel="${this.esc(c.id)}">
            <span class="chan-ic">${ICONS[p.key] || "🔗"}</span>
            <span class="chan-info">
              <b>${this.esc(String(c.account_name || "مرتبط").slice(0, 40))}</b>
              <small class="${bad ? "warn" : "ok"}">${bad ? (reauthList.includes(c.platform) ? "⚠️ انتهت صلاحية الربط — أعد ربط القناة" : "⚠️ تصريح التجديد غير متاح — أعد ربط القناة") : "✅ الحساب مرتبط"}</small>
            </span>
            <span class="chan-acts">
              ${c.is_default ? '<span class="hint ok">⭐ افتراضية</span>' : `<button class="btn btn-ghost btn-sm" data-default="${this.esc(c.id)}">⭐ اجعلها الافتراضية</button>`}
              ${prov && ready ? `<button class="btn btn-ghost btn-sm" data-connect="${this.esc(p.key)}">🔄 إعادة الربط</button>` : ""}
              <button class="btn btn-ghost btn-sm" data-unlink="${this.esc(c.id)}" data-platform="${this.esc(p.key)}">فك الربط</button>
            </span>
          </div>`;
        };
        return `<div class="chan-group" data-soc="${this.esc(p.key)}">
          ${head}
          <div class="chan-list">${mine.map(one).join("")}</div>
          <div class="chan-foot">
            ${prov && ready ? `<button class="btn btn-ghost btn-sm" data-connect="${this.esc(p.key)}">➕ إضافة قناة</button>` : ""}
            <small class="hint">${this.data?.config?.all_channels ? "اختيارك الحالي: النشر على كل القنوات المرتبطة." : "اختيارك الحالي: النشر على القناة الافتراضية (⭐)."} أضف قناة ثانية بحساب صاحبها.</small>
          </div>
        </div>`;
      }
      if (!prov) {
        return `<div class="chan-group muted" data-soc="${this.esc(p.key)}">${head}${missing}
          <small class="hint">قريبًا — لا يوجد ربط/نشر لهذه المنصة بعد</small></div>`;
      }
      if (!ready) {
        return `<div class="chan-group" data-soc="${this.esc(p.key)}" data-notready="1">${head}${missing}
          <small class="hint">الربط غير مهيأ على الخادم — مفاتيح ${prov === "meta" ? "META_APP_ID/SECRET" : prov.toUpperCase() + "_CLIENT_*"} غير مضبوطة</small>
          <button class="btn btn-ghost btn-sm" disabled title="أضف مفاتيح التطبيق في Vercel ثم أعد النشر">⚙️ غير مهيأ</button></div>`;
      }
      return `<div class="chan-group" data-soc="${this.esc(p.key)}">${head}${missing}
        <div class="chan-foot"><button class="btn btn-em btn-sm" data-connect="${this.esc(p.key)}">🔗 اربط من ${this.esc(p.name)}</button>
        <small class="hint">بعد الربط تُضبط الأتمتة تلقائيًا؛ وقد تحتاج لإعادة الربط لو انتهت الصلاحية</small></div></div>`;
    };

    // القنوات المرتبطة والمنصات المختارة بلا ربط تبقى ظاهرة؛ الباقي للفتح عند الحاجة.
    const connected = (p) => conns.some((c) => c.platform === p.key);
    const important = this.available.filter((p) => connected(p) || selected.includes(p.key));
    const other = this.available.filter((p) => !connected(p) && !selected.includes(p.key));
    const showInitially = conns.length ? important : [...important, ...other.filter((p) => p.publish && p.ready !== false)];
    const secondary = other.filter((p) => !showInitially.includes(p));
    wrap.innerHTML = showInitially.map(block).join("") + (secondary.length
      ? `<details class="chan-more" id="acctMorePlatforms" ${moreWasOpen ? "open" : ""}>
          <summary>ربط منصات تانية <small>(${secondary.length})</small></summary>
          <div class="chan-more-list">${secondary.map(block).join("")}</div>
        </details>` : "");
    /* الحالة والخطوات تعتمد على القنوات، فنُعيد رسمهما بعد التحميل */
    this.renderStatus(this.data || {});
    this.renderSteps(this.data || {});
    this.renderAutoPanel(this.data || {});
    return conns;
  },

  /* رسالة العودة من المزوّد: /#/account?linked=youtube | linked=youtube_err | linked=err */
  reportLinkedFlag() {
    try {
      const raw = String(window.location.hash || "");
      /* ?setup=<provider> تعني أن الخادم لا يملك مفاتيح المزوّد بعد */
      const setup = raw.match(/[?&]setup=([a-z_]+)/i);
      if (setup) {
        const prov = setup[1].toLowerCase();
        const label = prov === "meta" ? "فيسبوك/إنستغرام" : (PLATFORMS[prov] || prov);
        const notice0 = document.getElementById("acctNotice");
        const msg0 = `⚙️ ربط ${label} غير مهيأ بعد: مفاتيح التطبيق (${prov === "meta" ? "META_APP_ID وMETA_APP_SECRET" : prov.toUpperCase() + "_CLIENT_*"}) غير مضبوطة في Vercel. الربط متاح الآن ليوتيوب وتيك توك وX.`;
        if (notice0) { notice0.hidden = false; notice0.style.display = "block"; notice0.textContent = msg0; notice0.style.color = "#ffcf8b"; }
        if (typeof toast === "function") toast(msg0);
        try { history.replaceState(null, "", window.location.pathname + "#/account"); } catch {}
        return;
      }
      const m = raw.match(/[?&]linked=([a-z_]+)/i);
      if (!m) return;
      const flag = m[1].toLowerCase();
      /* الخادم يرسل linked=youtube_err مع ?w=<سبب> — نزيل _err للاسم ونشرح السبب.
       * (كانت الرسالة تعرض «youtube_err» حرفيًا وتطلب إعادة المحاولة بلا سبب.) */
      const base = flag.replace(/_err$/, "");
      const ok = (Boolean(CONNECT_PLATFORM[base]) || base === "meta") && !/_err$/.test(flag) && flag !== "err";
      const label = PLATFORMS[base] || (base === "meta" ? "فيسبوك/إنستغرام" : base);
      const whyKey = (raw.match(/[?&]w=([a-z_]+)/i) || [])[1] || "";
      const WHY = {
        denied: "لم توافق على كل الصلاحيات في شاشة جوجل/المزوّد (رفع الفيديوهات وقراءة القناة). إن كان التطبيق في وضع الاختبار فأضف حسابك كـ Test user ثم أعد المحاولة.",
        store: "تعذّر حفظ الربط على الخادم — حاول تاني.",
        no_code: "لم يصل رمز التفويض من المزوّد — ابدأ الربط من جديد من نفس المتصفح.",
        state: "انتهت صلاحية جلسة التفويض أو مُنعت كوكيز الطرف الأول — أعد المحاولة الآن من نفس المتصفح دون فتح النافذة في تبويب آخر.",
        token: "وصل الرمز لكن تبادله فشل — تحقّق من أسرار التطبيق (Client ID/Secret) وعنوان إعادة التوجيه المسجّل.",
        channel: "جوجل لم ترجع قناة يوتيوب واضحة. تأكد إن الحساب عنده قناة ووافق على صلاحية قراءتها، ثم أعد الربط.",
        err: "لم يصل رمز التفويض — أعد المحاولة من نفس المتصفح.",
      };
      const notice = document.getElementById("acctNotice");
      const msg = ok
        ? (/auto_error=1/.test(raw) ? `⚠️ تم ربط ${label} لكن تعذّر تفعيل الأتمتة؛ احفظ الإعدادات يدويًا.`
          : /auto_resume=published/.test(raw) ? `✅ تم ربط ${label} ونشر الفيديو الجاهز تلقائيًا.`
          : /auto_resume=failed/.test(raw) ? `⚠️ تم ربط ${label}، لكن محاولة نشر الفيديو الجاهز لم تكتمل. راجع السجل.`
          : `✅ تم ربط ${label}. راجع حالة الأتمتة من أعلى الصفحة.`)
        : `⚠️ لم يكتمل ربط ${label}${whyKey ? " (" + whyKey + ")" : ""}: ${WHY[whyKey] || "أعد المحاولة، وتأكد من الموافقة على كل الصلاحيات المطلوبة."}`;
      const channelHint = ok && /[?&]channel=nondefault(?:&|$)/.test(raw) ? " القناة دي مش الافتراضية؛ في وضع قناة واحدة، لو عايز تنشر عليها اختار «اجعلها الافتراضية» من بطاقة القنوات." : "";
      if (notice) { notice.hidden = false; notice.style.display = "block"; notice.textContent = msg + channelHint; notice.style.color = ok ? "#7ee0a2" : "#ffb4a2"; }
      if (typeof toast === "function") toast(msg + channelHint);
      // تنظيف الرابط حتى لا تتكرر الرسالة عند كل تحديث
      try { history.replaceState(null, "", window.location.pathname + "#/account"); } catch {}
    } catch { /* تجاهل */ }
  },

  /* ربط/فك ربط — مستمع واحد مفوَّض (الأزرار تُعاد بناؤها بعد كل تحديث) */
  wireConnections() {
    if (this._connWired) return;
    const wrap = document.getElementById("acctAccountsList");
    if (!wrap) return;
    this._connWired = true;
    wrap.addEventListener("click", async (e) => {
      const btnC = e.target.closest("[data-connect]");
      const btnD = e.target.closest("[data-unlink]");
      if (btnC) {
        const url = connectPath(btnC.dataset.connect, await window.AuthApp.getToken());
        if (!url) { if (typeof toast === "function") toast("سجّل الدخول أولًا لربط القناة", "err"); return; }
        btnC.disabled = true;
        btnC.textContent = "⏳ جارٍ التحويل…";
        window.location.href = url; // الخادم يحوّل بدوره إلى المزوّد (302)
        return;
      }
      const btnDef = e.target.closest("[data-default]");
      if (btnDef) {
        const id = btnDef.dataset.default;
        if (!id) return;
        btnDef.disabled = true;
        try {
          const res = await fetch("/api/gw?op=default", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${await window.AuthApp.getToken()}` },
            body: JSON.stringify({ id }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "تعذّر تعيين القناة");
          if (typeof toast === "function") toast("⭐ صارت القناة الافتراضية للنشر");
          await this.renderConnections(await window.AuthApp.getToken());
        } catch (error) {
          if (typeof toast === "function") toast(String(error?.message || error).slice(0, 120), "err");
          btnDef.disabled = false;
        }
        return;
      }
      if (btnD) {
        const id = btnD.dataset.unlink;
        if (!id || !confirm("فك ربط هذا الحساب؟ ستُحذف التوكنات فورًا.")) return;
        btnD.disabled = true;
        try {
          const res = await fetch("/api/gw?op=disconnect", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${await window.AuthApp.getToken()}` },
            body: JSON.stringify({ id }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "تعذّر فك الربط");
          if (typeof toast === "function") toast("✓ تم فك الربط");
          await this.renderConnections(await window.AuthApp.getToken());
        } catch (error) {
          if (typeof toast === "function") toast(String(error?.message || error).slice(0, 120), "err");
          btnD.disabled = false;
        }
      }
    });
  },

  /* تحديث الحساب من أماكن أخرى (app.js ينادي QRPublish.refreshAccount) */
  refreshAccount() { return this.init(); },
  afterLogin() { return this.init(); },
  wireGlobals() { /* لا شيء مطلوب الآن — تُبقي النداء آمنًا */ },
  /* جدولة من صانع الريلز بعد التصدير: تحتاج رفع الفيديو إلى التخزين أولًا */
  scheduleFromExport() {
    const msg = "لجدولة فيديو مُصدَّر: اربط قناة أولًا من «حسابي»، ثم استخدم «جدولة للنشر» بعد التصدير.";
    if (typeof toast === "function") toast(msg);
    else alert(msg);
  },

  /* ============================================================
   * ربط الأحداث — مستمع واحد مفوَّض على صفحة الحساب.
   * (الطريقة القديمة: addEventListener لكل زر بعد كل رسم ⇒ مستمعات
   * مكرّرة تُرسل الطلب مرتين، وأزرار جديدة بلا مستمع.)
   * ============================================================ */
  bindEvents() {
    this.wireConnections();
    if (this._wired) return;
    const root = document.getElementById("view-account") || document;
    this._wired = true;

    const ACTIONS = {
      autoSave: "save", autoRun: "run", autoRunAll: "run_all",
      autoGenArticle: "article_random", quickGenArticle: "article_random",
      quickRunAll: "run_all", quickSelfTest: "selftest", quickRenderTest: "selftest_deep",
      btnRetryPublish: "retry_publish",
    };

    root.addEventListener("click", async (e) => {
      const el = e.target.closest("[data-act], button, a");
      if (!el || el.disabled) return;
      /* أزرار الربط/الفك/الافتراضية يتولاها wireConnections */
      if (el.dataset.connect || el.dataset.unlink || el.dataset.default !== undefined) return;
      const act = el.dataset.act || ACTIONS[el.id];
      if (!act) return;
      e.preventDefault();
      if (act === "save") return this.saveSettings({ btn: el });
      if (act === "run" || act === "run_all") return this.runNow(act, el);
      if (act === "article_random") return this.randomArticle(el);
      if (act === "selftest") return this.runSelfTest(el, false);
      if (act === "selftest_deep") return this.runSelfTest(el, true);
      if (act === "retry_publish") return this.retryPublish(el);
    });

    /* مفتاح التشغيل/الإيقاف في بطاقة الحالة: يُحفظ فورًا */
    root.addEventListener("change", async (e) => {
      const t = e.target;
      if (!t || t.id !== "acctEnabled") return;
      const want = Boolean(t.checked);
      t.disabled = true;
      const out = await this.saveSettings({ enabled: want, silent: true });
      t.disabled = false;
      if (out && out.ok) {
        t.checked = want;
        this.data = { ...(this.data || {}), config: { ...((this.data || {}).config || {}), enabled: want } };
        this.renderStatus(this.data);
        this.renderSteps(this.data);
        if (typeof toast === "function") toast(want ? "✅ الأتمتة شغّالة — الفيديو القادم تلقائي" : "⏸️ أوقفنا الأتمتة (تقدر ترجّعها في أي وقت)");
      } else {
        t.checked = !want;
      }
    });
  },

  async api(action, payload = {}) {
    const res = await fetch("/api/autopilot", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await window.AuthApp.getToken()}` },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, ...data };
  },

  /* حفظ كل التخصيصات (المحتوى/القارئ/الخلفية/المنصات/الحالة) */
  async saveSettings({ enabled, silent = false, btn = null } = {}) {
    const q2 = (id) => document.getElementById(id);
    const platforms = [...document.querySelectorAll("#acctPlatforms input[data-platform]:checked:not(:disabled)")].map((i) => i.dataset.platform);
    const reciter = q2("selReciter") ? q2("selReciter").value : "";
    const template = {
      content_mode: q2("selContentMode") ? q2("selContentMode").value : "mix",
      background: q2("selBackground") ? q2("selBackground").value : "rotate",
      reciter_mode: reciter ? "fixed" : "rotate",
      reciter: reciter || "",
      privacy: "public",
    };
    const enabledNow = enabled !== undefined ? Boolean(enabled) : Boolean(q2("acctEnabled") && q2("acctEnabled").checked);
    const body = { enabled: enabledNow, platforms, template, all_channels: q2("chkAllChannels") ? Boolean(q2("chkAllChannels").checked) : Boolean(this.data?.config?.all_channels) };

    const old = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "⏳ جارٍ الحفظ…"; }
    let out = { ok: false };
    try {
      out = await this.api("save", body);
    } catch { out = { ok: false, error: "تعذّر الاتصال بالخادم" }; }
    if (btn) { btn.disabled = false; btn.textContent = old; }

    if (out.ok) {
      this.data = { ...(this.data || {}), config: { ...((this.data || {}).config || {}), ...(out.config || {}), enabled: enabledNow, platforms, template, all_channels: body.all_channels } };
      this.renderStatus(this.data);
      this.renderSteps(this.data);
      if (!silent && typeof toast === "function") toast("✅ تم حفظ التعديلات");
    } else if (typeof toast === "function") toast(String(out.error || "تعذّر الحفظ"), "err");
    return out;
  },

  async runNow(kind, btn) {
    if (this._runPending) return;
    this._runPending = true;
    this._progressBaseline = this._lastProgressRunId || this.data?.runs?.[0]?.id || null;
    this._progressWaiting = true;
    this.renderProgress();
    this.startProgressPolling();
    if (btn) { btn.disabled = true; }
    const old = btn ? btn.textContent : "";
    if (btn) btn.textContent = "⏳ جارٍ التشغيل…";
    try {
      const out = kind === "run_all" ? await this.api("run_all") : await this.api("run");
      if (out.ok) {
        const extra = Array.isArray(out.results) ? " · النتائج: " + out.results.map((r) => (r.ok ? "✅" : "❌")).join(" ") : "";
        if (typeof toast === "function") toast("تم بدء التوليد — سيظهر في السجل أدناه" + extra);
        setTimeout(() => this.init(), 1200);
      } else if (typeof toast === "function") toast(String(out.error || "تعذّر التشغيل"), "err");
    } catch {
      if (typeof toast === "function") toast("الاتصال اتقطع؛ راجع حالة التشغيل قبل ما تحاول تاني", "err");
    }
    this._runPending = false;
    this._progressWaiting = false;
    this.startProgressPolling();
    if (btn) { btn.disabled = false; btn.textContent = old; }
  },

  async randomArticle(btn) {
    if (btn) { btn.disabled = true; }
    try {
      const out = await this.api("article_random");
      if (out.ok) {
        if (typeof toast === "function") toast(`📚 ${out.article_title || "مقال"} — ${out.url || ""}`);
        else alert(`📚 ${out.article_title || "مقال"} — ${out.url || ""}`);
      } else if (typeof toast === "function") toast(String(out.error || "تعذّر التوليد من مقال"), "err");
    } catch { }
    if (btn) { btn.disabled = false; }
  },

  async retryPublish(btn) {
    if (btn) { btn.disabled = true; btn.textContent = "⏳ جارٍ النشر…"; }
    try {
      const out = await this.api("retry_publish");
      if (out.ok) { if (typeof toast === "function") toast("تم نشر الفيديو الجاهز ✅"); return this.init(); }
      if (typeof toast === "function") toast(String(out.error || "تعذّر النشر — أعد الربط أولًا"), "err");
    } catch {
      if (typeof toast === "function") toast("تعذّر الاتصال بالخادم", "err");
    }
    if (btn) { btn.disabled = false; btn.textContent = "🔁 انشر الفيديو الجاهز"; }
  },

  /* فحص محرّك التوليد: سريع (يقلع المتصفح) وعميق (يُنتج فيديو قصيرًا فعلًا) */
  async runSelfTest(btn, deep) {
    const notice = document.getElementById("acctNotice");
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = deep ? "⏳ جارٍ توليد فيديو تجريبي…" : "⏳ جارٍ الفحص…";
    if (notice) {
      notice.hidden = false;
      notice.style.display = "block";
      notice.style.color = "";
      notice.textContent = deep
        ? "نُنتج الآن فيديو قصيرًا على الخادم (آية واحدة) للتأكد أن التسجيل يعمل — قد يستغرق حتى دقيقتين."
        : "نجرّب إطلاق المتصفح على الخادم…";
    }
    try {
      const res = await fetch("/api/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await window.AuthApp.getToken()}` },
        body: JSON.stringify({ action: "selftest_render", deep }),
      });
      const data = await res.json().catch(() => ({}));
      if (notice) {
        notice.hidden = false;
        notice.style.display = "block";
        const secs = Math.round((data.ms || 0) / 100) / 10;
        if (data.ok && deep) {
          const ex = data.export || {};
          const a = data.audio_direct || {}, ap = data.audio_proxy || {};
          const audio = `تلاوة: ${a.ok ? "✅ " + a.status + " · " + a.ms + "ms" : "⚠️ فشل" + (a.status ? " (" + a.status + ")" : "")}`
            + ` · عبر الوسيط: ${ap.ok ? "✅" : "⚠️" + (ap.status ? " (" + ap.status + ")" : "")}`;
          const failed = Array.isArray(data.failed_requests) && data.failed_requests.length
            ? ` · طلبات فاشلة: ${data.failed_requests.length}` : "";
          const saved = data.recorded ? " · محفوظ ✓" : " · لم تُحفظ النتيجة";
          notice.textContent = ex.ok
            ? `✅ توليد الفيديو يعمل: وصل إلى ${ex.pct || "100%"} في ${Math.round((ex.ms || 0) / 100) / 10}ث (المحرّك ${secs}ث)${ex.meta ? " · " + ex.meta : ""} · ${audio}${saved}`
            : `⚠️ المحرّك يقلع لكن التصدير لم يكتمل: ${ex.stage || "مرحلة غير معروفة"} — ${audio}${failed} — ${String(data.error || "").slice(0, 140)}${saved}`;
          notice.style.color = ex.ok ? "#7ee0a2" : "#ffb4a2";
        } else {
          notice.textContent = data.ok
            ? `✅ محرّك التوليد يعمل (Node ${data.node} · ${secs}ث · صفحة: ${String(data.page_title || "").slice(0, 60)})`
            : `⚠️ محرّك التوليد لا يعمل: ${String(data.error || "سبب غير معروف").slice(0, 200)}`;
          notice.style.color = data.ok ? "#7ee0a2" : "#ffb4a2";
        }
      }
    } catch (error) {
      if (notice) {
        notice.hidden = false;
        notice.style.display = "block";
        notice.style.color = "#ffb4a2";
        notice.textContent = "تعذّر تنفيذ الفحص: " + String(error?.message || error).slice(0, 120);
      }
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  },
};


/* ============================================================
 * واجهة الدخول — الربط الذي كان مفقودًا
 * ------------------------------------------------------------
 * كانت الصفحة تعرض زر «دخول» (#authBtn) بلا أي مستمع نقر، ونافذة الدخول
 * (#loginOverlay) غير موجودة في الماركب بعد استبدال صفحة الحساب القديمة.
 * فكان الضغط على «دخول» لا يفعل شيئًا. هنا يُربط الزر بالنافذة، والنافذة
 * بـQRAuth (رابط سحري + جوجل) الموجود فعلًا في public/js/auth.js.
 * ============================================================ */
window.QRAuthUI = (function () {
  const $ = (id) => document.getElementById(id);
  let wired = false;

  function open() {
    const o = $("loginOverlay");
    if (!o) return;
    o.hidden = false;
    setTimeout(() => { try { $("loginEmail")?.focus(); } catch {} }, 40);
  }
  function close() { const o = $("loginOverlay"); if (o) o.hidden = true; }
  function isOpen() { const o = $("loginOverlay"); return Boolean(o && !o.hidden); }

  async function submitEmail() {
    const input = $("loginEmail"), btn = $("loginSubmit");
    const em = (input?.value || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) {
      if (typeof toast === "function") toast("اكتب بريدًا صحيحًا أولًا", "err");
      try { input?.focus(); } catch {}
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = "جارٍ الإرسال…"; }
    try {
      await QRAuth.magicLink(em);
      if (typeof toast === "function") toast("✓ أرسلنا رابط الدخول — تفقد بريدك");
      close();
    } catch (error) {
      if (typeof toast === "function") toast(String(error?.message || "تعذّر إرسال الرابط").slice(0, 120), "err");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "أرسل الرابط"; }
    }
  }

  function wire() {
    if (wired) return;
    wired = true;

    $("authBtn")?.addEventListener("click", () => {
      let u = null;
      try { u = QRAuth.user(); } catch {}
      if (u) window.location.hash = "#/account";
      else open();
    });

    $("loginSubmit")?.addEventListener("click", submitEmail);
    $("loginEmail")?.addEventListener("keydown", (e) => { if (e.key === "Enter") submitEmail(); });
    $("loginGoogle")?.addEventListener("click", () => { try { QRAuth.google(); } catch {} });
    $("loginClose")?.addEventListener("click", close);
    $("loginOverlay")?.addEventListener("click", (e) => { if (e.target === e.currentTarget) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen()) close(); });

    try {
      QRAuth.on((u) => {
        const b = $("authBtn");
        if (b) b.textContent = u ? "🟢 حسابي" : "🔑 دخول";
        if (u) {
          close();
          if (window.location.hash === "#/account") window.PublishApp.init();
        }
      });
      const b = $("authBtn");
      if (b) b.textContent = QRAuth.user() ? "🟢 حسابي" : "🔑 دخول";
    } catch {}
  }

  return { wire, open, close, isOpen, submitEmail };
})();

// التشغيل التلقائي عند تحميل الصفحة
function bootAccount() {
  window.QRAuthUI?.wire();
  /* كان الشرط يساوي #/account حرفيًا، فلا تعمل صفحة الحساب عند العودة من
   * المزوّد (#/account?linked=youtube) ولا عند أي بارامتر — فلا تُعرض القنوات. */
  if (/^#\/account(\?|$)/.test(window.location.hash || "")) window.PublishApp.init();
}
document.addEventListener("DOMContentLoaded", bootAccount);
window.addEventListener("hashchange", bootAccount);

/* app.js و creator.js ينادون QRPublish (refreshAccount · afterLogin · wireGlobals ·
 * scheduleFromExport) بينما هذا الملف يعرّف PublishApp — فكانت النداءات الثلاثة
 * تُتجاهل بصمت (typeof QRPublish === "undefined") ولا تُهيّأ صفحة الحساب أبدًا. */
window.QRPublish = window.PublishApp;

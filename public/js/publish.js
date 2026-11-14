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
  return `/api/gw?op=start&p=${prov}`;
}

/* وقت UTC دون تاريخ لا يحدد إزاحة القاهرة الصيفية؛ لا نخمنها بتاريخ وهمي. */
function cairoClockLabel(v) {
  try {
    if (typeof v === "string" && /^\d{1,2}:\d{2}(:\d{2})?$/.test(v.trim())) {
      const [h, m, s = "0"] = v.trim().split(":").map(Number);
      if (h > 23 || m > 59 || s > 59) return "وقت غير صالح";
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} UTC`;
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
  
  validRevision(v) { return v === null || (typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)); },
  validAccountConfig(config) {
    return Boolean(config && typeof config === "object" && this.validRevision(config.settings_revision) && typeof config.enabled === "boolean" &&
      Array.isArray(config.platforms) && config.platforms.every(p => typeof p === "string") &&
      config.template && typeof config.template === "object" && !Array.isArray(config.template));
  },
  savedMatches(config, body) {
    const same = (actual, expected) => {
      if (expected && typeof expected === "object") {
        if (!actual || typeof actual !== "object" || Array.isArray(actual) !== Array.isArray(expected)) return false;
        if (Array.isArray(expected) && actual.length !== expected.length) return false;
        return Object.keys(expected).every(k => same(actual[k], expected[k]));
      }
      return actual === expected;
    };
    if (!this.validAccountConfig(config) || !config.settings_revision || config.enabled !== body.enabled ||
        !same(config.platforms, body.platforms) || config.all_channels !== body.all_channels ||
        !same(config.template, body.template)) return false;
    return body.template.background !== "custom" || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(config.template.background_image_id || "");
  },
  showUncertainty() {
    const box = document.getElementById("acctRecovery");
    if (box) box.hidden = !this._settingsUncertain;
    const save = document.getElementById("autoSave"); if (save) save.disabled = Boolean(this._settingsUncertain || this._settingsPending);
    const resume = document.getElementById("acctResume"); if (resume) resume.hidden = !this._reviewedUncertain;
    const review = document.getElementById("acctSavedReview"); if (review) review.hidden = !this._reviewedUncertain;
  },
  async pauseSafely(btn) {
    if (!this._settingsUncertain || this._settingsPending) return;
    const owner = this._accountOwner;
    const expected = this.validRevision(this.data?.config?.settings_revision) ? this.data.config.settings_revision : null;
    this._initSeq = (this._initSeq || 0) + 1;
    // A previously reviewed snapshot is no longer actionable once a pause begins.
    this._reviewedUncertain = false; this.showUncertainty();
    this._settingsPending = true; if (btn) btn.disabled = true;
    try {
      const out = await this.api("set_enabled", { enabled: false, expected_revision: expected }, owner);
      if (owner !== this._accountOwner) return;
      if (!out.ok || out.enabled !== false || !this.validAccountConfig(out.config) || !out.config.settings_revision) throw new Error("unconfirmed");
      this.data = { ...(this.data || {}), config: out.config };
      this._reviewedUncertain = false; this.showUncertainty(); this.renderStatus(this.data);
      if (typeof toast === "function") toast("⏸️ تم إيقاف الأتمتة؛ راجع الإعدادات قبل تعديل المسودة");
    } catch {
      if (owner === this._accountOwner && typeof toast === "function") toast("تعذّر تأكيد الإيقاف؛ تحقق من الخادم قبل المحاولة مجددًا", "err");
    } finally {
      this._settingsPending = false; if (btn) btn.disabled = false;
      if (owner !== this._accountOwner) this.init();
    }
  },
  async reviewSettings() {
    if (!this._settingsUncertain || this._reviewPending || this._settingsPending) return;
    this._reviewPending = true;
    // Do not let an earlier review be acknowledged while a new read is pending
    // or after it fails. Only the latest successful read can unlock the draft.
    this._reviewedUncertain = false; this.showUncertainty();
    const owner = this._accountOwner, seq = this._initSeq = (this._initSeq || 0) + 1;
    const button = document.getElementById("acctRecheck"); if (button) button.disabled = true;
    try {
      const token = await window.AuthApp.getToken();
      if (!token || seq !== this._initSeq || owner !== this._accountOwner || await window.AuthApp.getUserId() !== owner || seq !== this._initSeq || owner !== this._accountOwner) return;
      const res = await fetch("/api/autopilot", { method: "GET", cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (seq !== this._initSeq || owner !== this._accountOwner || await window.AuthApp.getUserId() !== owner || seq !== this._initSeq || owner !== this._accountOwner) return;
      if (!res.ok || !this.validAccountConfig(data.config)) throw new Error("invalid response");
      this.data = data;
      const c = data.config, t = c.template;
      const summary = { "الأتمتة": c.enabled ? "مفعّلة" : "موقوفة", "المنصات": c.platforms, "كل القنوات": c.all_channels === true ? "نعم" : c.all_channels === false ? "لا" : "غير معروف", "محتوى الفيديو": t.content_mode, "السورة": t.surah ?? "تلقائي", "من آية": t.from ?? "تلقائي", "إلى آية": t.to ?? "تلقائي", "القارئ": t.reciter || "تلقائي", "الخلفية": t.background, "معرّف الصورة": t.background_image_id || "لا يوجد", "تصميم الفيديو": t.design || "تلقائي" };
      const output = document.getElementById("acctSavedReviewText"); if (output) output.textContent = JSON.stringify(summary, null, 2);
      this._reviewedUncertain = true;
      this.showUncertainty();
    } catch {
      if (seq === this._initSeq && typeof toast === "function") toast("تعذّر التحقق من إعدادات الخادم؛ حاول تاني", "err");
    } finally {
      this._reviewPending = false;
      if (button) button.disabled = false;
    }
  },
  resumeSettings() {
    if (!this._settingsUncertain || !this._reviewedUncertain || this._settingsPending || this._reviewPending) return;
    this._settingsUncertain = false; this._reviewedUncertain = false;
    this._draftRevision = this.data.config.settings_revision;
    this.showUncertainty();
    const toggle = document.getElementById("acctEnabled"); if (toggle) toggle.disabled = false;
    this.renderStatus(this.data || {}); this.renderSteps(this.data || {});
  },

  clearAccountData(uid) {
    this._accountOwner = uid;
    this._disconnectAttempts = new Map(); // invalidate delayed notices on identity changes
    this._connectAttempt = null; // invalidate pending OAuth-start results on identity changes
    this._autoDirty = false; this._draftRevision = undefined; this._draftBackgroundImageId = null; this._draftAllChannels = false;
    const editor = document.getElementById("acctAuto"); if (editor) editor._reelGeneration = (editor._reelGeneration || 0) + 1;
    if (this._progressTimer) clearTimeout(this._progressTimer);
    this._progressWaiting = false; this._lastProgressRunId = null;
    this.data = null; this.connections = []; this._connectionsState = "loading"; this._connectionsSeq = (this._connectionsSeq || 0) + 1; this._bgPreviewCache = null;
    this.lastDailyLine = ""; this.lastReauthLine = ""; this.lastCheckLine = ""; this.lastDiagBox = "";
    for (const id of ["acctAuto", "acctAccountsList", "acctSteps", "acctKpis", "acctAlerts", "queueList", "acctPendingReviewList", "acctFailedReviewList", "acctQuickActions", "acctProgress", "acctSavedReviewText"]) {
      const node = document.getElementById(id); if (node) node.innerHTML = "";
    }
    const notice = document.getElementById("acctNotice");
    if (notice) { notice.textContent = ""; notice.hidden = true; notice.style.display = "none"; notice.style.color = ""; delete notice.dataset.loadError; }
    const badge = document.getElementById("acctDraftBadge"); if (badge) badge.hidden = true;
    for (const [id, text] of [["acctCustomizeSummary", "المحتوى، الشكل والمنصات"], ["acctHistorySummary", "نتائج المحاولات وإحصاءات النشر"], ["acctPendingSummary", "جارٍ التحقق من المهام…"], ["acctFailedSummary", "جارٍ التحقق من المحاولات…"]]) {
      const summary = document.getElementById(id); if (summary) { summary.textContent = text; summary.classList.remove("warn"); }
    }
    const accounts = document.getElementById("acctAccounts"); if (accounts) accounts.hidden = true;
    this.reauth = []; this._settingsUncertain = false; this._reviewedUncertain = false; this.showUncertainty();
    const toggle = document.getElementById("acctEnabled"); if (toggle) { toggle.checked = false; toggle.disabled = true; }
    const label = document.getElementById("acctStateLabel"); if (label) label.textContent = "جارٍ التحقق…";
    const next = document.getElementById("acctNextRun"); if (next) next.textContent = "—";
    const dot = document.getElementById("acctDot"); if (dot) dot.className = "acct-dot";
  },
  authIdentityChanged(uid) {
    uid = typeof uid === "string" && uid ? uid : null;
    if (this._accountOwner === uid) return;
    // Invalidate old reads immediately, before awaiting token or user lookups.
    this._initSeq = (this._initSeq || 0) + 1;
    this.clearAccountData(uid);
    if (!uid) {
      const notice = document.getElementById("acctNotice");
      if (notice) { notice.hidden = false; notice.style.display = "block"; notice.dataset.loadError = "1"; notice.textContent = "سجّل الدخول لعرض لوحة النشر والأتمتة."; }
    }
  },

  async init() {
    const seq = this._initSeq = (this._initSeq || 0) + 1;
    const uid = await window.AuthApp.getUserId();
    if (seq !== this._initSeq) return;
    if (this._accountOwner !== uid) this.clearAccountData(uid);
    if (!uid) {
      // لا نُخرج المستخدم من الصفحة: نفتح نافذة الدخول ونوضّح المطلوب.
      window.QRAuthUI?.open();
      const notice = document.getElementById("acctNotice");
      if (notice) {
        notice.hidden = false;
        notice.style.display = "block";
        notice.dataset.loadError = "1";
        notice.textContent = "سجّل الدخول لعرض لوحة النشر والأتمتة — بريدك + رابط سحري، أو جوجل.";
      }
      return;
    }
    
    // تحميل البيانات
    let res, data;
    try {
      const token = await window.AuthApp.getToken();
      if (seq !== this._initSeq || await window.AuthApp.getUserId() !== uid || seq !== this._initSeq) return;
      res = await fetch("/api/autopilot", { method: "GET", headers: { Authorization: `Bearer ${token}` } });
      data = await res.json().catch(() => ({}));
      if (seq !== this._initSeq || await window.AuthApp.getUserId() !== uid || seq !== this._initSeq) return;
    } catch {
      if (seq === this._initSeq) {
        const notice = document.getElementById("acctNotice");
        if (notice) { notice.hidden = false; notice.style.display = "block"; notice.dataset.loadError = "1"; notice.textContent = "تعذّر الاتصال لتحميل الحساب؛ قد تكون الحالة والسجل والمهام المعروضة قديمة. حاول مرة أخرى؛ تعديلاتك غير المحفوظة باقية في الصفحة."; }
      }
      return;
    }
    if (seq !== this._initSeq || this._settingsPending) return;
    if (!res.ok) {
      const notice = document.getElementById("acctNotice");
      if (notice) {
        notice.hidden = false; notice.style.display = "block"; notice.dataset.loadError = "1";
        notice.textContent = res.status === 401
          ? "سجّل الدخول مجددًا؛ قد تكون الحالة والسجل والمهام المعروضة قديمة."
          : "تعذّر تحديث الحساب؛ قد تكون الحالة والسجل والمهام المعروضة قديمة. حاول مرة أخرى؛ تعديلاتك غير المحفوظة باقية.";
      }
      return;
    }
    
    if (!this.validAccountConfig(data.config)) {
      const notice = document.getElementById("acctNotice");
      if (notice) { notice.hidden = false; notice.style.display = "block"; notice.dataset.loadError = "1"; notice.textContent = "بيانات الحساب غير مكتملة؛ قد تكون الحالة والسجل والمهام المعروضة قديمة. لم نغيّر الإعدادات؛ حاول مرة أخرى."; }
      return;
    }
    if (this._settingsUncertain) { this._reviewedUncertain = false; this.showUncertainty(); }
    const notice = document.getElementById("acctNotice");
    if (notice && notice.dataset.loadError) { delete notice.dataset.loadError; notice.hidden = true; notice.style.display = "none"; }
    const toggle = document.getElementById("acctEnabled"); if (toggle) toggle.disabled = Boolean(this._settingsUncertain);
    this.renderAccount(data);
    this.bindEvents(uid);
    this.startProgressPolling();
    // حالة الربط الحقيقية — تُقرأ من op=list (الخادم لا يرسل التوكنات أبدًا)
    try {
      const token = await window.AuthApp.getToken();
      if (seq !== this._initSeq) return;
      await this.renderConnections(token, seq);
    } catch { /* تُعرض حالة القنوات عند المحاولة التالية */ }
    if (seq === this._initSeq) this.reportLinkedFlag();
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
    if (/invalid_grant|invalid_client|expired or revoked|unauthorized_client|انتهت صلاحية ربط/i.test(t)) {
      const platform = /tiktok|تيك توك/i.test(t) ? "تيك توك" : /\bx\b|twitter/i.test(t) ? "X" : /youtube|يوتيوب/i.test(t) ? "يوتيوب" : "المنصة";
      return "فشل تجديد ربط " + platform + " في هذه المحاولة — تحقق من حالة القنوات؛ قد تحتاج إعادة الربط";
    }
    if (/quotaExceeded|exceeded your quota/i.test(t)) return "تجاوز الحد اليومي للرفع على يوتيوب — راجع النتيجة قبل إعادة المحاولة";
    return t;
  },

  /* موعد تشغيل الكرون القادم 04:15 UTC؛ الساعة المحلية تتغير صيفًا. */
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
    return n ? `📚 إنشاء ونشر من مقال (${n.toLocaleString("ar-EG")} مقال)` : "📚 إنشاء ونشر من مقال";
  },

  /* ---------- سطر آخر تشغيل آلي ---------- */
  dailyLine(d) {
    if (!d || !d.run_date) return "";
    const day = String(d.run_date).slice(0, 10);
    const published = d.status === "published";
    const running = d.status === "rendering" || d.status === "queued";
    const state = published ? "✅ أُرسل للمنصة" : d.status === "rendering" ? "⏳ قيد التوليد" : d.status === "queued" ? "⏳ في الطابور أو قيد النشر" : d.status === "failed" ? "⚠️ فشل أو نتيجة تحتاج مراجعة" : "حالة غير معروفة";
    const why = d.status === "failed" && d.error ? " — " + this.friendly(String(d.error).slice(0, 140)) : "";
    const links = published ? String(d.external_url || "").split(" | ").map(v => this.safeUrl(v.trim())).filter(Boolean) : [];
    const link = links.map((url, i) => ` · <a href="${this.esc(url)}" target="_blank" rel="noopener noreferrer">رابط المنشور${links.length > 1 ? " " + (i + 1) : ""}</a>`).join("");
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
      if (/invalid_grant|invalid_client|expired or revoked|unauthorized_client|انتهت صلاحية ربط/i.test(raw)) {
        arr.push(/tiktok|تيك توك/i.test(raw) ? "tiktok" : /youtube|يوتيوب/i.test(raw) ? "youtube" : /\bx\b|twitter/i.test(raw) ? "x" : "المنصة غير المحددة");
      }
    }
    if (!arr.length) return "";
    const names = arr.map((p) => this.esc(PLATFORMS[p] || p)).join("، ");
    return `<div class="auto-warning" id="acctReauth">⚠️ فشل تجديد سابق: ${names}. لا يثبت ذلك حالة الربط الحالية أو يحدد القناة؛ راجع القنوات والسجل، وقد تحتاج «🔄 محاولة إعادة الربط». لا تُعاد المحاولات الفاشلة تلقائيًا؛ راجع القناة والسجل قبل أي إعادة نشر.
      <div class="row gap-lg" style="margin-top:10px"><button class="btn btn-gold" id="btnRetryPublish" data-act="retry_publish">🔍 افحص محاولات أتمتة اليوم الفاشلة</button></div></div>`;
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
    if (this._settingsUncertain) {
      if (toggle) toggle.disabled = true;
      if (dot) dot.className = "acct-dot warn";
      if (label) label.textContent = "نتيجة آخر تغيير غير مؤكدة";
      if (nextEl) nextEl.textContent = "تحقق من إعدادات الخادم قبل المحاولة تاني";
      return;
    }
    if (toggle) toggle.checked = enabled;

    const next = this.nextRunInfo();
    const nextTxt = `الموعد المجدول بعد ${this.humanGap(next.inMs)} · ${this.cairoClockLabel(next.at)} القاهرة`;

    let state = "idle", title = "الأتمتة موقوفة", hint = "اضغط الزر لتفعيل النشر اليومي التلقائي";
    if (this._connectionsState === "loading") { state = "idle"; title = enabled ? "الأتمتة مفعّلة" : "الأتمتة موقوفة"; hint = "جارٍ التحقق من القنوات المرتبطة"; }
    else if (this._connectionsState === "error") { state = "warn"; title = enabled ? "الأتمتة مفعّلة — حالة القنوات غير معروفة" : "الأتمتة موقوفة — حالة القنوات غير معروفة"; hint = "تعذّر تحميل القنوات؛ حدّث الصفحة للتحقق"; }
    else if (!conns.length) { state = "idle"; title = enabled ? "الأتمتة مفعّلة، لكن لا توجد قناة مرتبطة" : "اربط قناة للبدء"; hint = "لا توجد قناة مرتبطة حاليًا — لا يمكن النشر قبل الربط"; }
    else if (reauth.length) { state = "warn"; title = "فشل تجديد سابق: " + reauth.map((p) => PLATFORMS[p] || p).join("، "); hint = "راجع القنوات والسجل؛ التحذير لا يؤكد حالة الربط الحالية"; }
    else if (enabled && (!Array.isArray(config.platforms) || !config.platforms.length || config.platforms.some(p => !conns.some(c => c.platform === p)))) { state = "warn"; title = "الأتمتة مفعّلة — تحقق من وجهات النشر"; hint = "اختر منصة واربط قناة لكل منصة مختارة"; }
    else if (enabled && conns.some(c => config.platforms?.includes(c.platform) && c.has_refresh === false)) { state = "warn"; title = "الأتمتة مفعّلة — قد تحتاج إعادة ربط"; hint = "تعذّر التحقق من تصريح التجديد لبعض القنوات؛ راجع بطاقة القنوات"; }
    else if (enabled && typeof config.all_channels !== "boolean") { state = "warn"; title = "الأتمتة مفعّلة — إعداد القنوات غير واضح"; hint = "راجع إعدادات الخادم قبل الاعتماد على الوجهة"; }
    else if (enabled && config.all_channels === false && config.platforms.some(p => {
      const rows = conns.filter(c => c.platform === p);
      return rows.some(c => typeof c.is_default !== "boolean") || rows.filter(c => c.is_default === true).length !== 1;
    })) { state = "warn"; title = "الأتمتة مفعّلة — راجع القناة الافتراضية"; hint = "الافتراضية غير واضحة في القائمة المحمّلة؛ قد تُختار وجهة أخرى وقت النشر"; }
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
      { n: 1, t: "اربط قناة", d: this._connectionsState === "error" ? "تعذّر التحقق من القنوات" : this._connectionsState === "loading" ? "جارٍ التحقق من القنوات…" : "يوتيوب / فيسبوك / إنستغرام / تيك توك / X", done: this._connectionsState !== "error" && this._connectionsState !== "loading" && conns.length > 0 },
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
    const st = data.stats && typeof data.stats === "object" ? data.stats : null;
    if (!st) {
      wrap.innerHTML = ["منشور", "في الطابور", "فشل", "آخر نشر"].map(label => `<div class="kpi"><b>—</b><span>${label}</span></div>`).join("") + '<p class="hint warn">تعذّر تحميل إحصاءات النشر. حاول تحديث الصفحة.</p>';
      return;
    }
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

    const MODES = { mix: "متنوّع (آيات وسور)", famous: "سور مشهورة", sequential: "بالترتيب (مصحف)", article: "من مقال", fixed: "اختيار سورة وآيات بنفسي" };
    const d = template.design || { translation: "none", showTrans: false, style: "card", ratio: "9:16", quality: 1080, accent: "gold", fontSize: 100, showWatermark: true, motion: true, dedText: "" };
    const opt = (values, selected) => values.map(([v, label]) => `<option value="${this.esc(v)}" ${String(v) === String(selected) ? "selected" : ""}>${this.esc(label)}</option>`).join("");
    const BGS = {
      rotate: "تتغيّر تلقائيًا", custom: "صورة من جهازي", "grad-emerald": "تدرّج زمردي", "grad-gold": "تدرّج ذهبي", "grad-dawn": "تدرّج الفجر", "grad-night": "تدرّج ليلي",
      "bg-mosque-night": "مسجد ليلًا", "bg-starry-desert": "صحراء بنجوم", "bg-ocean-sunset": "غروب البحر", "bg-forest-rays": "غابة وأشعة",
      "bg-geometric-islamic": "زخرفة إسلامية", "bg-mountains-dawn": "جبال الفجر", "bg-mosque-silhouette": "ظلّ مسجد",
      "bg-garden-tulips": "حديقة", "bg-arabesque-dark": "أرابيسك", "bg-heavenly-clouds": "سحاب",
    };
    const modes = (Array.isArray(options.content_modes) && options.content_modes.length ? options.content_modes : Object.keys(MODES));
    const reciters = Array.isArray(options.reciters) ? options.reciters : (Array.isArray(data.reciters) ? data.reciters : []);
    const suppliedBgs = Array.isArray(options.backgrounds) && options.backgrounds.length ? options.backgrounds : Object.keys(BGS);
    const bgs = [...new Set([...suppliedBgs, "custom"])];
    // Preserve disclosure state across clean background refreshes.
    const appearanceOpen = Boolean(wrap.querySelector("#acctAppearance")?.open);
    const moreOpen = Boolean(wrap.querySelector(".acct-more")?.open);

    this._autoDirty = false;
    this._draftRevision = config.settings_revision;
    this._draftBackgroundImageId = template.background === "custom" ? template.background_image_id || null : null;
    this._draftAllChannels = config.all_channels === true;
    wrap.innerHTML = `
      <div class="acct-panel-intro"><h2>التخصيص</h2><p class="hint">احفظ التعديلات لتطبيقها؛ مفتاح الأتمتة يستخدم الإعدادات المحفوظة.</p></div>
      <div class="acct-grid3">
        <div class="f-group"><label for="selContentMode">محتوى الفيديو</label>
          <select id="selContentMode">${modes.map((m) => `<option value="${this.esc(m)}" ${template.content_mode === m ? "selected" : ""}>${this.esc(MODES[m] || m)}</option>`).join("")}</select>
        </div>
        <div class="f-group"><label for="acctReciter">القارئ</label>
          <select id="acctReciter">
            <option value="" ${template.reciter_mode !== "fixed" ? "selected" : ""}>تلقائي (يتنوّع كل يوم)</option>
            ${reciters.map((r) => `<option value="${this.esc(r.id)}" ${template.reciter_mode === "fixed" && template.reciter === r.id ? "selected" : ""}>${this.esc(r.name || r.id)}</option>`).join("")}
          </select>
        </div>
        <div class="f-group"><label for="selBackground">الخلفية</label>
          <select id="selBackground">${bgs.map((b) => `<option value="${this.esc(b)}" ${template.background === b ? "selected" : ""}>${this.esc(BGS[b] || b)}</option>`).join("")}</select>
        </div>
      </div>
          <div id="acctFixedRange" ${template.content_mode === "fixed" ? "" : "hidden"}>
          <div class="acct-grid3">
            <div class="f-group"><label for="acctSurah">السورة</label><select id="acctSurah" data-value="${this.esc(template.surah || 112)}"></select></div>
            <div class="f-group"><label for="acctFrom">من آية</label><input type="number" id="acctFrom" min="1" value="${this.esc(template.from || 1)}"></div>
            <div class="f-group"><label for="acctTo">لآية</label><input type="number" id="acctTo" min="1" value="${this.esc(template.to || 4)}"></div>
          </div>
          <p class="hint">لو اخترت آيات بنفسك، نفس المقطع هيتكرر في التشغيل التلقائي. للمقاطع الطويلة ممكن يتوقف التشغيل بدل ما يقصّ آياتك.</p>
      </div>
      <div class="f-group"><label>المنصات التي يُنشر عليها</label><div class="plat-checks" id="acctPlatforms"></div></div>
      ${multi ? `<div class="switch-row">
        <div class="t">انشر على كل القنوات المرتبطة<small>عند التعطيل قد تختار المهمة بلا قناة محددة الافتراضية وقت النشر، أو أحدث اتصال إذا غابت؛ المهام الموجودة قد تختلف. القنوات الظاهرة: ${[...chanCount.entries()].filter(([, n]) => n > 1).map(([k, n]) => `${this.esc(PLATFORMS[k] || k)}: ${n}`).join(" · ")}</small></div>
        <label class="switch"><input type="checkbox" id="chkAllChannels" ${config.all_channels ? "checked" : ""}><i></i></label>
      </div>` : ""}
      <div class="row gap-lg acct-actions">
        <button class="btn btn-gold" id="autoSave" data-act="save" ${this._settingsPending || this._settingsUncertain ? "disabled" : ""}>💾 حفظ التعديلات</button>
        <button class="btn btn-em" id="autoRun" data-act="run">▶️ تشغيل الآن</button>
      </div>
      <p class="acct-edit-state hint" id="acctEditState" role="status" aria-live="polite">لا توجد تعديلات غير محفوظة في هذه الصفحة.</p>
      <p class="hint acct-run-note">«تشغيل الآن» ينشئ فيديو ويحاول نشره فورًا بالإعدادات المحفوظة (بحد أقصى ٣ مرات يوميًا) — الأتمتة اليومية تعمل حتى لو لم تفتح الموقع.</p>
      <details class="acct-appearance" id="acctAppearance" ${appearanceOpen ? "open" : ""}>
        <summary><span><b>المعاينة وتخصيص الشكل</b><small id="acctAppearanceSummary" aria-live="polite">صورة الخلفية، الترجمة، المقاس والألوان</small></span><span aria-hidden="true">⌄</span></summary>
        <div class="acct-appearance-body">
      <div class="f-group"><label for="acctBackgroundFile">صورة من الجهاز (JPEG أو PNG، حتى ١٠ ميجابايت)</label><input id="acctBackgroundFile" type="file" accept="image/jpeg,image/png"><p class="hint">تُعرض محليًا أولًا، وعند اختيار «صورة من جهازي» والضغط على حفظ تُصغّر وتُرفع إلى حسابك بشكل خاص لتعمل الأتمتة حتى والموقع مغلق. قد تظهر في الفيديو المنشور. عند حفظ خلفية أخرى تُحذف الصورة المحفوظة؛ قد يكون تشغيل بدأ بالفعل قد استخدمها.</p></div>
      <div class="acct-reel-editor">
        <div class="acct-preview"><div class="preview-label">معاينة الشكل <span>● مباشرة</span></div><div class="phone-screen" id="acctPreviewScreen"><canvas id="acctPreviewCanvas" width="405" height="720" aria-label="معاينة شكل الريل"></canvas></div><p class="hint" id="acctPreviewNote">المعاينة صورة تقريبية؛ الاختيارات التلقائية تتحدد وقت التشغيل.</p><div id="acctAudioPreview" hidden><label for="acctAudio">استمع لأول آية بالقارئ المختار</label><audio id="acctAudio" controls preload="none"></audio></div></div>
        <div class="acct-reel-controls">
          <label class="chk"><input type="checkbox" id="acctDesignEnabled" ${template.design ? "checked" : ""}> استخدم تخصيص الشكل بدل الشكل التلقائي</label>
          <div class="acct-grid2">
            <div class="f-group"><label for="acctStyle">أسلوب النص</label><select id="acctStyle">${opt([["card","بطاقة كلاسيكية"],["minimal","أنيق بسيط"],["banner","بانر سينمائي"],["word","كلمة بكلمة"]],d.style)}</select></div>
            <div class="f-group"><label for="acctTranslation">الترجمة</label><select id="acctTranslation">${opt([["none","بدون ترجمة"],["ar","العربية"],["en.sahih","الإنجليزية"],["fr.hamidullah","الفرنسية"],["tr.diyanet","التركية"],["id.indonesian","الإندونيسية"],["ur.jalandhry","الأردية"],["es.cortes","الإسبانية"],["it.piccardo","الإيطالية"]],d.translation)}</select></div>
            <div class="f-group"><label for="acctRatio">المقاس</label><select id="acctRatio">${opt([["9:16","ريلز 9:16"],["1:1","مربع 1:1"],["16:9","عريض 16:9"]],d.ratio)}</select></div>
            <div class="f-group"><label for="acctQuality">الجودة</label><select id="acctQuality">${opt([[1080,"عالية 1080p"],[720,"سريعة 720p"]],d.quality)}</select></div>
            <div class="f-group"><label for="acctAccent">لون التمييز</label><select id="acctAccent">${opt([["gold","ذهبي"],["emerald","زمردي"],["silver","فضي"],["rose","وردي"]],d.accent)}</select></div>
            <div class="f-group"><label for="acctFont">حجم الخط</label><input id="acctFont" type="range" min="70" max="140" step="5" value="${this.esc(d.fontSize)}"></div>
          </div>
          <div class="f-group"><label for="acctDed">الإهداء (اختياري)</label><input id="acctDed" maxlength="180" value="${this.esc(d.dedText)}" placeholder="اكتب الإهداء"></div>
          <div class="plat-checks"><label class="chk"><input id="acctShowTrans" type="checkbox" ${d.showTrans ? "checked" : ""}> إظهار الترجمة</label><label class="chk"><input id="acctWatermark" type="checkbox" ${d.showWatermark ? "checked" : ""}> العلامة المائية</label><label class="chk"><input id="acctMotion" type="checkbox" ${d.motion ? "checked" : ""}> حركة الخلفية</label></div>

        </div>
      </div>
        </div>
      </details>
      <details class="acct-more" ${moreOpen ? "open" : ""}>
        <summary>خيارات إضافية</summary>
        <div class="row gap-lg acct-actions">
          <button class="btn btn-ghost" id="autoRunAll" data-act="run_all">⚡ تشغيل حسب الإعدادات المحفوظة</button>
          <button class="btn btn-ghost" id="autoGenArticle" data-act="article_random">${articleLabel}</button>
        </div>
      </details>`;

    this.renderPlatformChecks(data);
    this.initReelEditor(wrap);
    this.renderEditState();
  },

  setPreviewSummary(warning = "") {
    const summary = document.getElementById("acctCustomizeSummary");
    if (!summary) return;
    summary.textContent = warning || "المحتوى، الشكل والمنصات";
    summary.classList.toggle("warn", Boolean(warning));
  },

  /* نرسم بمحرك الصانع نفسه، من غير إنشاء أو نشر أو تغيير إعداداته المحلية. */
  initReelEditor(wrap) {
    const generation = (wrap._reelGeneration || 0) + 1;
    wrap._reelGeneration = generation;
    const syncSelection = e => {
      if (e?.target?.id === "selContentMode") wrap.querySelector("#acctFixedRange").hidden = e.target.value !== "fixed";
      if (e?.target?.id === "selBackground" && e.target.value === "custom") wrap.querySelector("#acctAppearance").open = true;
    };
    if (typeof Quran === "undefined" || typeof ReelRenderer === "undefined" || typeof BACKGROUNDS === "undefined") {
      // The draft must remain protected even if preview dependencies fail to load.
      const summary = wrap.querySelector("#acctAppearanceSummary");
      if (summary) { summary.textContent = "المعاينة غير متاحة؛ افتح التفاصيل وراجع إعداداتك."; summary.classList.add("warn"); }
      this.setPreviewSummary("المعاينة غير متاحة؛ افتح الإعدادات للمراجعة.");
      const note = wrap.querySelector("#acctPreviewNote");
      if (note) note.textContent = "المعاينة غير متاحة؛ حدّث الصفحة وحاول مجددًا.";
      const mark = e => { syncSelection(e); this._autoDirty = true; this._autoEditRevision = (this._autoEditRevision || 0) + 1; this.renderEditState(); };
      wrap.oninput = mark; wrap.onchange = mark;
      return;
    }
    const get = id => wrap.querySelector("#" + id);
    const previewNote = (text, warning = false) => {
      get("acctPreviewNote").textContent = text;
      const summary = get("acctAppearanceSummary");
      summary.textContent = warning ? text : "صورة الخلفية، الترجمة، المقاس والألوان";
      summary.classList.toggle("warn", warning);
      this.setPreviewSummary(warning ? text : "");
    };
    let revision = 0;
    const current = token => wrap.isConnected && wrap._reelGeneration === generation && token === revision;
    const update = async () => {
      const token = ++revision;
      const fixed = get("selContentMode").value === "fixed";
      get("acctFixedRange").hidden = !fixed;
      try {
        await Quran.load();
        if (!current(token)) return;
        const surah = get("acctSurah");
        if (!surah.options.length) {
          const selected = surah.dataset.value;
          surah.innerHTML = Quran.surahs.map(s => `<option value="${s.n}">${this.esc(s.name)}</option>`).join("");
          surah.value = selected;
        }
        const s = fixed ? Number(surah.value) : 112;
        const from = fixed ? Number(get("acctFrom").value) : 1;
        const to = fixed ? Number(get("acctTo").value) : 4;
        if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > Quran.ayahCount(s) || to - from >= 40) {
          const audio = get("acctAudio"); audio.pause(); audio.removeAttribute("src"); audio.load();
          get("acctAudioPreview").hidden = true;
          const cv = get("acctPreviewCanvas"); cv.getContext("2d")?.clearRect(0, 0, cv.width, cv.height);
          previewNote("اختار آيات صحيحة من السورة (حد أقصى ٤٠ آية).", true); return;
        }
        const audioWrap = get("acctAudioPreview"), audio = get("acctAudio");
        const reader = get("acctReciter").value;
        audioWrap.hidden = !fixed || !reader;
        if (fixed && reader) {
          const url = "/proxy?u=" + encodeURIComponent(`https://everyayah.com/data/${reader}/${String(s).padStart(3, "0")}${String(from).padStart(3, "0")}.mp3`);
          if (audio.getAttribute("src") !== url) audio.setAttribute("src", url);
        } else if (audio.hasAttribute("src")) { audio.pause(); audio.removeAttribute("src"); audio.load(); }
        const enabled = get("acctDesignEnabled").checked;
        const tr = enabled ? get("acctTranslation").value : "none";
        if (enabled && get("acctShowTrans").checked && tr !== "none" && tr !== "ar") await Quran.loadTranslation(tr);
        const cv = get("acctPreviewCanvas"), screen = get("acctPreviewScreen");
        const ratio = enabled ? get("acctRatio").value : "9:16";
        const sizes = { "9:16": [405,720,""], "1:1": [560,560,"ratio-1-1"], "16:9": [640,360,"ratio-16-9"] };
        const [w,h,cls] = sizes[ratio]; cv.width = w; cv.height = h; screen.className = "phone-screen " + cls;
        const renderer = new ReelRenderer(cv);
        const bg = get("selBackground").value;
        const selectedBg = BACKGROUNDS.find(b => b.id === bg) || BACKGROUNDS[0];
        let customUrl = null, tempUrl = null;
        try {
          if (bg === "custom") {
            const file = get("acctBackgroundFile").files[0];
            if (file) {
              if (!['image/jpeg','image/png'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error("invalid image");
              customUrl = tempUrl = URL.createObjectURL(file);
            } else {
              const id = this._draftBackgroundImageId;
              if (!id) throw new Error("select image");
              if (!this._bgPreviewCache || this._bgPreviewCache.id !== id) {
                const response = await fetch("/api/autopilot?background=1", { cache:"no-store", headers:{ Authorization:`Bearer ${await window.AuthApp.getToken()}` } });
                const result = await response.json();
                if (!response.ok || result.image_id !== id || typeof result.image !== "string" || !result.image.startsWith("data:image/jpeg;base64,")) throw new Error("background unavailable");
                this._bgPreviewCache = { id, image: result.image };
              }
              customUrl = this._bgPreviewCache.image;
            }
          }
          await renderer.setBackground(selectedBg, customUrl);
        } finally { if (tempUrl) URL.revokeObjectURL(tempUrl); }
        if ((selectedBg.file || bg === "custom") && !renderer.bgImg) throw new Error("background unavailable");
        if (!current(token)) return;
        renderer.setConfig({ verses:[{s,a:from,text:Quran.ayah(s,from)}], index:0, ayahElapsed:99, surahName:"سورة " + Quran.shortName(s),
          reciterName: get("acctReciter").selectedOptions[0]?.textContent || "تلقائي", style: enabled ? get("acctStyle").value : "card",
          accent: enabled ? get("acctAccent").value : "gold", fontSize: enabled ? Number(get("acctFont").value) : 100,
          showTrans: enabled && get("acctShowTrans").checked && tr !== "none", translationId:tr,
          customTrans: tr === "ar" ? Quran.ayah(s,from) : Quran.trText(tr,s,from),
          showWatermark: enabled ? get("acctWatermark").checked : true, motion: enabled ? get("acctMotion").checked : true,
          dedMode: enabled && get("acctDed").value ? "custom" : "none", dedText: enabled ? get("acctDed").value : "" });
        renderer.draw();
        previewNote(fixed && bg !== "rotate" && enabled && get("acctReciter").value ? "معاينة تقريبية لأول آية؛ التلاوة والحركة تظهر في الفيديو." : "دي عيّنة للشكل؛ السورة أو القارئ أو الخلفية أو الأسلوب التلقائي بيتحدد وقت التشغيل.");
      } catch { if (current(token)) { const cv = get("acctPreviewCanvas"); cv.getContext("2d")?.clearRect(0, 0, cv.width, cv.height); previewNote("تعذّر تحميل المعاينة أو الصورة أو الترجمة؛ جرّب تاني قبل الحفظ.", true); } }
    };
    const changed = e => {
      syncSelection(e);
      this._autoDirty = true;
      this._autoEditRevision = (this._autoEditRevision || 0) + 1;
      this.renderEditState();
      if (e.target.id === "acctBackgroundFile" && e.target.files?.length) get("selBackground").value = "custom";
      if (/^acct(?:Style|Translation|Ratio|Quality|Accent|Font|Ded|ShowTrans|Watermark|Motion)$/.test(e.target.id)) get("acctDesignEnabled").checked = true;
      if (e.target.id === "acctTranslation") get("acctShowTrans").checked = e.target.value !== "none";
      update();
    };
    // إعادة رسم البطاقة لا تكدّس مستمعات قديمة أو تعيد المعاينة أكثر من مرة.
    wrap.oninput = changed; wrap.onchange = changed;
    update();
  },

  renderEditState() {
    const state = document.getElementById("acctEditState");
    const badge = document.getElementById("acctDraftBadge");
    if (badge) badge.hidden = !this._autoDirty;
    if (!state) return;
    state.textContent = this._autoDirty ? "عندك تعديلات غير محفوظة؛ اضغط حفظ التعديلات لتطبيقها. التشغيل يستخدم الإعدادات المحفوظة. قد تضيع التعديلات عند تحديث الصفحة أو تغيير الحساب." : "لا توجد تعديلات غير محفوظة في هذه الصفحة.";
    state.classList.toggle("warn", Boolean(this._autoDirty));
  },

  /* نعرض فقط المراحل التي سجّلها الخادم وحالة كل صف نشر فعلي. */
  renderProgress(data = {}) {
    const wrap = document.getElementById("acctProgress");
    if (!wrap) return;
    const head = '<div class="acct-sec-head"><div><span class="acct-overline">المتابعة المباشرة</span><h2>آخر تشغيل</h2></div><span class="acct-card-icon" aria-hidden="true">◷</span></div>';
    const detailsOpen = Boolean(wrap.querySelector(".acct-progress-detail")?.open);
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
    const latest = events.length ? `<p class="acct-progress-latest">${this.esc(labels[events[events.length - 1].stage])}</p>` : "";
    const targetWarning = targets.some(t => t.status === "failed") ? '<p class="hint warn">بعض القنوات تحتاج مراجعة؛ افتح تفاصيل التشغيل.</p>' : "";
    wrap.innerHTML = head + `<p class="acct-progress-state"><b>${this.esc(states[r.status] || "حالة غير معروفة")}</b>${r.title ? ` · ${this.esc(r.title)}` : ""}</p>` + latest + warning + targetWarning + error + `<details class="acct-progress-detail" ${detailsOpen ? "open" : ""}><summary>تفاصيل المراحل والقنوات</summary>${steps}${channels}<p class="hint">${at}لو الاتصال اتقطع، راجع الحالة قبل ما تشغّل تاني.</p></details>`;
  },

  startProgressPolling() {
    if (this._progressTimer) clearTimeout(this._progressTimer);
    this.pollProgress();
  },
  async pollProgress() {
    if (this._progressBusy) return;
    this._progressBusy = true;
    const owner = this._accountOwner;
    try {
      const token = await window.AuthApp.getToken();
      if (!token) throw new Error("no session");
      const res = await fetch("/api/autopilot?progress=1", { method: "GET", cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("unavailable");
      const data = await res.json();
      if (owner !== this._accountOwner) return;
      if (this._progressWaiting && data.run && data.run.id !== this._progressBaseline) this._progressWaiting = false;
      if (data.run?.id) this._lastProgressRunId = data.run.id;
      this.renderProgress(data);
    } catch {
      if (owner !== this._accountOwner) return;
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
  renderHistory(runs, available = true, statsAvailable = true) {
    const list = document.getElementById("queueList");
    const summary = document.getElementById("acctHistorySummary");
    const rows = Array.isArray(runs) ? runs : [];
    if (summary) {
      summary.classList.toggle("warn", !available || !statsAvailable);
      const historyText = !available ? "تعذّر تحميل السجل" : rows.length ? `${rows.length} تشغيل في العرض` : "لا تشغيلات ظاهرة";
      summary.textContent = `${historyText} · ${statsAvailable ? "إحصاءات النشر" : "تعذّر تحميل الإحصاءات"}`;
    }
    if (!list) return;
    if (!available) { list.innerHTML = '<p class="hint warn">تعذّر تحميل السجل. حاول تحديث الصفحة؛ هذا لا يعني عدم وجود تشغيلات.</p>'; return; }
    if (!rows.length) {
      list.innerHTML = `<p class="hint">لا يوجد سجل بعد — أول تشغيل سيظهر هنا تلقائيًا.</p>`;
      return;
    }
    list.innerHTML = rows.map((r) => {
      const state = ({ published: "✅ أُرسل للمنصة", rendering: "⏳ قيد الإنشاء", queued: "⏳ في الطابور أو قيد النشر", failed: "⚠️ لم تكتمل المحاولة" })[r.status] || "حالة غير معروفة";
      const links = String(r.external_url || "").split(" | ").map(v => this.safeUrl(v.trim())).filter(Boolean);
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
        ${links.length ? `<div class="auto-run-url">${links.map((url, i) => `<a href="${this.esc(url)}" target="_blank" rel="noopener noreferrer">🔗 رابط النشر ${links.length > 1 ? i + 1 : ""}</a>`).join(" · ")}</div>` : ""}
        ${r.error ? `<div class="auto-run-error">⚠️ ${this.esc(this.friendly(r.error))}</div>` : ""}
      </div>`;
    }).join("");
  },

  validReviewItems(review, statuses = null) {
    return Boolean(review && review.available === true && Array.isArray(review.items) && review.items.every(item =>
      item && typeof item.id === "string" && item.id.trim() && typeof item.platform === "string" && item.platform.trim() &&
      typeof item.target_recorded === "boolean" && (item.channel == null || typeof item.channel === "string") &&
      (item.target_recorded || !item.channel) && (!statuses || statuses.includes(item.status))));
  },

  reviewTimestamp(value) {
    // Queue timestamps need a date and explicit zone; otherwise Cairo is ambiguous.
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) || Number.isNaN(Date.parse(value))) return "وقت غير متاح";
    return this.cairoClockLabel(value) + " (القاهرة)";
  },

  renderReviewSummary(id, review, statuses) {
    const summary = document.getElementById(id);
    if (!summary) return;
    const valid = this.validReviewItems(review, statuses);
    summary.classList.toggle("warn", !valid || (valid && review.items.length > 0));
    summary.textContent = !valid ? "تعذّر التحقق — افتح التفاصيل" : review.items.length
      ? `${review.items.length} في اللقطة${review.truncated ? " وقد توجد أخرى" : ""} · افتح للمراجعة`
      : "لا عناصر ظاهرة في هذه اللقطة";
  },

  renderPendingReview(review) {
    this.renderReviewSummary("acctPendingSummary", review, ["scheduled", "publishing", "draft"]);
    const list = document.getElementById("acctPendingReviewList");
    if (!list) return;
    if (!this.validReviewItems(review, ["scheduled", "publishing", "draft"])) {
      list.innerHTML = '<p class="hint warn">تعذّر تحميل مهام النشر أو التحقق من بياناتها؛ هذا لا يعني عدم وجود مهام.</p>'; return;
    }
    if (!review.items.length) { list.innerHTML = '<p class="hint">لم تظهر مهام مجدولة أو مسودات أو مهام قيد النشر في هذه القراءة؛ لا يثبت ذلك خلو الطابور.</p>'; return; }
    const states = {scheduled: "مجدولة", publishing: "قيد النشر", draft: "مسودة"};
    list.innerHTML = review.items.map(item => {
      const target = item.channel ? `القناة المرتبطة حاليًا بالمعرّف المسجّل: ${item.channel}` : item.target_recorded ? "تعذّر معرفة اسم القناة المسجّلة من القائمة المحمّلة؛ راجع المهمة" : "الوجهة غير محددة في المهمة؛ قد تُختار قناة أخرى عند النشر";
      const when = this.reviewTimestamp(item.publish_at);
      return `<div class="auto-run"><div class="auto-run-head"><span class="auto-run-title">${this.esc(item.title || "فيديو بلا عنوان")}</span><span class="auto-run-date">${this.esc(when)}</span></div><div class="auto-run-body"><span>${this.esc(PLATFORMS[item.platform] || item.platform || "منصة غير معروفة")}</span><span>${this.esc(states[item.status] || "حالة غير معروفة")}</span><span>${this.esc(target)}</span></div><small class="hint">معرّف المهمة: ${this.esc(item.id || "غير متاح")}</small></div>`;
    }).join("") + (review.truncated ? '<p class="hint warn">تظهر أول ٢٠ مهمة حسب موعد النشر؛ قد توجد مهام أخرى.</p>' : "");
  },

  renderFailedReview(review) {
    this.renderReviewSummary("acctFailedSummary", review);
    const list = document.getElementById("acctFailedReviewList");
    if (!list) return;
    if (!this.validReviewItems(review)) {
      list.innerHTML = '<p class="hint warn">تعذّر تحميل قائمة المحاولات أو التحقق من بياناتها؛ هذا لا يعني عدم وجودها.</p>'; return;
    }
    if (!review.items.length) { list.innerHTML = '<p class="hint">لم تظهر محاولات فاشلة في هذه القراءة؛ لا يثبت ذلك خلو السجل.</p>'; return; }
    list.innerHTML = review.items.map(item => {
      const target = item.channel ? `القناة المرتبطة حاليًا بالمعرّف المسجّل: ${item.channel}` : item.target_recorded ? "تعذّر معرفة اسم القناة المسجّلة من القائمة المحمّلة" : "الوجهة الأصلية غير محددة في السجل";
      return `<div class="auto-run"><div class="auto-run-head"><span class="auto-run-title">${this.esc(item.title || "فيديو بلا عنوان")}</span><span class="auto-run-date">${this.esc(this.reviewTimestamp(item.created_at))}</span></div><div class="auto-run-body"><span>${this.esc(PLATFORMS[item.platform] || item.platform || "منصة غير معروفة")}</span><span>${this.esc(target)}</span></div><small class="hint">معرّف المحاولة: ${this.esc(item.id || "غير متاح")}</small></div>`;
    }).join("") + (review.truncated ? '<p class="hint warn">تظهر أحدث ٢٠ محاولة فقط؛ قد توجد محاولات أقدم.</p>' : "");
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
        <button class="btn btn-ghost" id="quickRunAll" data-act="run_all">⚡ تشغيل حسب الإعدادات المحفوظة</button>
        ${this.lastReauthLine ? "" : '<button class="btn btn-ghost" id="btnRetryPublish" data-act="retry_publish">🔍 افحص محاولات أتمتة اليوم الفاشلة</button>'}
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
      : ALL_PLATFORMS.map((k) => ({ key: k, name: PLATFORMS[k] || k, publish: false, ready: false }));
    this.reauth = Array.isArray(data.reauth) ? data.reauth.slice() : [];
    this.lastDailyLine = this.dailyLine(data.last_daily);
    this.lastCheckLine = this.checkLine(data.last_check);
    this.lastDiagBox = this.diagBox(data.last_check);
    this.lastReauthLine = this.reauthLineHTML(data.reauth);

    this.renderStatus(data);
    this.renderSteps(data);
    this.renderKpis(data);
    if (!this._autoDirty && !this._settingsPending) this.renderAutoPanel(data);
    this.renderHistory(runs, data.runs_available !== false, Boolean(data.stats && typeof data.stats === "object"));
    this.renderPendingReview(data.pending_review);
    this.renderFailedReview(data.failed_review);
    this.renderTools(data);
  },

  /* A token/response captured for one account must not update or redirect a
   * different account, even if the auth-change event has not arrived yet. */
  async accountStillCurrent(owner) {
    if (!owner || owner !== this._accountOwner) return false;
    let uid = null;
    try { uid = await window.AuthApp.getUserId(); } catch { /* unknown is not current */ }
    if (owner !== this._accountOwner) return false;
    if (uid === owner) return true;
    // Clear stale account data even when the authentication event is delayed.
    this.init().catch(() => {});
    return false;
  },

  /* قائمة الحسابات المرتبطة + أزرار ربط/فك ربط لكل منصة */
  async renderConnections(token, initSeq = null) {
    const owner = this._accountOwner;
    const connectionSeq = this._connectionsSeq = (this._connectionsSeq || 0) + 1;
    const card = document.getElementById("acctAccounts");
    const wrap = document.getElementById("acctAccountsList");
    if (!card || !wrap || !(await this.accountStillCurrent(owner))) return;
    if (connectionSeq !== this._connectionsSeq || (initSeq !== null && initSeq !== this._initSeq)) return;
    card.hidden = false;
    // نحافظ على القسم المفتوح عند تحديث القنوات بعد ربط أو فك ربط.
    const moreWasOpen = Boolean(wrap.querySelector("#acctMorePlatforms")?.open);
    const openDetails = new Set([...wrap.querySelectorAll(".chan-detail[open]")].map(d => d.closest(".chan-group")?.dataset.soc).filter(Boolean));
    wrap.innerHTML = '<p class="hint">جارٍ تحميل الحسابات المرتبطة…</p>';

    let conns = [];
    try {
      const res = await fetch("/api/gw?op=list", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.connections)) throw new Error("connections unavailable");
      conns = data.connections;
    } catch {
      if (connectionSeq !== this._connectionsSeq || owner !== this._accountOwner || (initSeq !== null && initSeq !== this._initSeq) || !(await this.accountStillCurrent(owner))) return;
      if (connectionSeq !== this._connectionsSeq || (initSeq !== null && initSeq !== this._initSeq)) return;
      this._connectionsState = "error";
      wrap.innerHTML = '<p class="hint warn">تعذّر تحميل الحسابات المرتبطة. حدّث الصفحة وحاول تاني.</p>';
      this.renderStatus(this.data || {}); this.renderSteps(this.data || {});
      return;
    }
    if (connectionSeq !== this._connectionsSeq || owner !== this._accountOwner || (initSeq !== null && initSeq !== this._initSeq) || !(await this.accountStillCurrent(owner))) return;
    if (connectionSeq !== this._connectionsSeq || (initSeq !== null && initSeq !== this._initSeq)) return;
    this.connections = conns;
    this._connectionsState = "loaded";

    const ICONS = { youtube: "▶️", facebook: "📘", instagram: "📸", tiktok: "🎵", x: "✖️", linkedin: "💼", telegram: "✈️", whatsapp: "💬" };
    const reauthList = Array.isArray(this.reauth) ? this.reauth : [];
    // reauth is platform-level historical evidence, not a per-channel result.
    // A missing usable stored refresh credential is a separate channel-level warning.
    const missingRefresh = (c) => c.has_refresh === false;
    const selected = Array.isArray(this.data?.config?.platforms) ? this.data.config.platforms : [];

    const block = (p) => {
      const mine = conns.filter((c) => c.platform === p.key);
      const prov = p.connect || CONNECT_PLATFORM[p.key];
      const ready = p.ready !== false;
      const head = `<div class="chan-head"><span class="chan-ic">${ICONS[p.key] || "🔗"}</span><b>${this.esc(p.name)}</b></div>`;
      const missing = !mine.length && selected.includes(p.key)
        ? '<small class="hint warn">المنصة مختارة للنشر، لكن مفيش قناة مرتبطة بيها.</small>' : "";

      if (mine.length) {
        const defaultsKnown = mine.every(c => typeof c.is_default === "boolean");
        const defaultCount = mine.filter(c => c.is_default === true).length;
        const mode = this.data?.config?.all_channels;
        const savedMode = mode === true
          ? "إعداد الأتمتة المعروض من الخادم: التخطيط لكل القنوات المرتبطة عند التشغيل."
          : mode === false ? "إعداد الأتمتة المعروض من الخادم: مهمة جديدة لكل منصة دون تثبيت قناة فيها."
          : "إعداد النشر على كل القنوات غير معروف؛ راجع إعدادات الخادم.";
        const defaultHint = !defaultsKnown
          ? "حالة الافتراضية في القائمة غير معروفة."
          : defaultCount > 1 ? "تظهر أكثر من قناة افتراضية؛ لا يمكن الجزم بأيّها ستُختار."
          : defaultCount === 0 ? "لا تظهر قناة افتراضية في القائمة المحمّلة."
          : "تظهر قناة افتراضية واحدة في القائمة المحمّلة.";
        const one = (c) => {
          const bad = missingRefresh(c);
          return `<div class="chan-card ${bad ? "off" : "on"}" data-soc="${this.esc(p.key)}" data-channel="${this.esc(c.id)}">
            <span class="chan-ic">${ICONS[p.key] || "🔗"}</span>
            <span class="chan-info">
              <b>${this.esc(String(c.account_name || "مرتبط").slice(0, 40))}</b>
              <small class="${bad ? "warn" : "ok"}">${bad ? "⚠️ تعذّر التحقق من وجود تصريح تجديد صالح — قد تحتاج إعادة الربط" : "القناة مسجّلة؛ صلاحيتها الحالية غير مؤكدة"}</small>
            </span>
            <span class="chan-acts">
              ${c.is_default === true ? '<span class="hint ok">⭐ افتراضية</span>' : typeof c.is_default === "boolean" ? `<button class="btn btn-ghost btn-sm" data-default="${this.esc(c.id)}" disabled title="تغيير القناة الافتراضية متوقف مؤقتًا لحماية وجهة النشر">⭐ تغيير الافتراضية غير متاح حاليًا</button>` : '<span class="hint warn">حالة الافتراضية غير معروفة</span>'}
              ${prov && ready ? `<button class="btn btn-ghost btn-sm" data-connect="${this.esc(p.key)}" data-connect-intent="relink" ${this._connectPending ? "disabled" : ""}>🔄 محاولة إعادة الربط</button>` : ""}
              <button class="btn btn-ghost btn-sm" data-unlink="${this.esc(c.id)}" data-platform="${this.esc(p.key)}" ${this._disconnectPending?.has(JSON.stringify([owner, c.id])) ? "disabled" : ""}>فك الربط</button>
            </span>
          </div>`;
        };
        return `<div class="chan-group" data-soc="${this.esc(p.key)}">
          ${head}
          ${reauthList.includes(p.key) ? '<small class="hint warn">⚠️ فشل تجديد سابق لهذه المنصة؛ لا يحدد القناة أو يثبت حالة الربط الحالية.</small>' : ""}
          <div class="chan-list">${mine.map(one).join("")}</div>
          <div class="chan-foot">
            ${prov && ready ? `<button class="btn btn-ghost btn-sm" data-connect="${this.esc(p.key)}" data-connect-intent="add" ${this._connectPending ? "disabled" : ""}>➕ إضافة قناة</button>` : ""}
            <small class="hint">${savedMode} هذا عرض للخادم وليس للمسودة غير المحفوظة. ${defaultHint} عند النشر بلا قناة محددة قد تُختار الافتراضية أو أحدث اتصال إذا غابت؛ قد تتغير الوجهة.</small>
            <details class="chan-detail" ${openDetails.has(p.key) ? "open" : ""}><summary>تفاصيل الوجهة والربط</summary>
              <small class="hint">هذا عرض للخادم وليس لتعديلات المسودة غير المحفوظة. عند النشر بلا قناة محددة قد يختار النظام الافتراضية وقت التنفيذ، أو أحدث اتصال إذا غابت؛ عند تساوي أوقات التحديث أو نقصها لا يمكن الجزم بالاختيار. وقد تتغير الوجهة. القائمة لقطة قد تكون غير مكتملة ولا تحدد وجهات المهام الموجودة.</small>
              <small class="hint">الحساب يُختار لدى المنصة؛ محاولة إعادة الربط لا تضمن تحديث القناة المقصودة، والإضافة قد تحدّث حسابًا موجودًا. راجع القنوات والأتمتة بعد العودة.</small>
            </details>
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
        <div class="chan-foot"><button class="btn btn-em btn-sm" data-connect="${this.esc(p.key)}" ${this._connectPending ? "disabled" : ""}>🔗 اربط من ${this.esc(p.name)}</button>
        <small class="hint">قد يؤدي الربط إلى تفعيل الأتمتة أو إضافة المنصة؛ راجع الإعدادات بعد العودة.</small></div></div>`;
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
    // تحديث القنوات لا يمس التعديلات التي لم يضغط المستخدم حفظها بعد.
    if (!this._autoDirty && !this._settingsPending) this.renderAutoPanel(this.data || {});
    return conns;
  },

  /* معلمات العودة ليست إثباتًا للربط أو لهوية الحساب: يمكن فتح رابط قديم أو معدّل. */
  reportLinkedFlag() {
    try {
      const raw = String(window.location.hash || "");
      const mark = raw.indexOf("?");
      if (mark < 0 || raw.slice(0, mark) !== "#/account") return;
      const params = new URLSearchParams(raw.slice(mark + 1));
      const setup = params.get("setup"), flag = params.get("linked");
      if (setup === null && flag === null) return;
      const labels = {youtube:"يوتيوب", meta:"فيسبوك/إنستغرام", facebook:"فيسبوك", instagram:"إنستغرام", tiktok:"تيك توك", x:"X"};
      const lookup = key => Object.prototype.hasOwnProperty.call(labels, key) ? labels[key] : "المنصة";
      const duplicate = params.getAll("setup").length > 1 || params.getAll("linked").length > 1 || (setup !== null && flag !== null);
      let msg;
      if (duplicate) {
        msg = "⚠️ رابط العودة غير واضح؛ راجع القنوات المرتبطة وحالة الأتمتة للحساب الحالي قبل المحاولة مجددًا.";
      } else if (setup !== null) {
        const provider = String(setup).toLowerCase();
        msg = `⚙️ يشير رابط العودة إلى أن ربط ${lookup(provider)} غير مهيأ على الخادم. راجع حالة المنصات أو تواصل مع المسؤول؛ الرابط وحده لا يؤكد الإعداد الحالي.`;
      } else {
        const value = String(flag).toLowerCase();
        const failed = value === "err" || value.endsWith("_err");
        const base = failed ? value.replace(/_err$/, "") : value;
        const label = lookup(base);
        const known = Object.prototype.hasOwnProperty.call(labels, base);
        const why = params.getAll("w").length === 1 ? params.get("w") : "";
        const reasons = {
          denied: "ربما رُفض التفويض أو ألغاه المستخدم.",
          store: "تعذّر تأكيد حفظ الربط؛ قد تكون بعض القنوات حُفظت بالفعل، خصوصًا في فيسبوك/إنستغرام.",
          no_code: "لم يصل رمز التفويض؛ ابدأ الربط من المتصفح نفسه.",
          state: "تعذّر التحقق من جلسة التفويض؛ ابدأ الربط من المتصفح نفسه.",
          token: "تعذّر تبادل رمز التفويض.",
          identity: "تعذّر التحقق من هوية الحساب لدى المزوّد؛ راجع الحساب والصلاحيات قبل المحاولة مجددًا.",
          pages: "لا يدعم الربط اختيار صفحة من عدة صفحات أو قائمة غير مكتملة بعد؛ راجع الصفحات والصلاحيات قبل المحاولة.",
          channel: "لم تصل قناة يوتيوب صالحة من المزوّد.",
        };
        if (failed || !known) {
          const detail = Object.prototype.hasOwnProperty.call(reasons, why) ? reasons[why] : "راجع القنوات قبل إعادة المحاولة.";
          msg = `⚠️ يشير رابط العودة إلى أن ربط ${label} ربما لم يكتمل. ${detail} راجع القنوات المرتبطة وحالة الأتمتة للحساب الحالي؛ الرابط وحده لا يؤكد النتيجة.`;
        } else {
          msg = `ℹ️ يشير رابط العودة إلى ربط ${label}، لكنه لا يؤكد نجاحه أو الحساب الذي تم الربط له. راجع القنوات المرتبطة وحالة الأتمتة للحساب الحالي؛ المحاولات الفاشلة لا تُعاد تلقائيًا.`;
          if (params.getAll("auto_error").length === 1 && params.get("auto_error") === "1") msg += " قد تكون الأتمتة لم تُفعّل؛ راجع إعداداتها.";
          if (params.getAll("auto_resume").length === 1 && ["published", "failed"].includes(params.get("auto_resume"))) msg += " هذا رابط عودة قديم؛ راجع السجل للتحقق من أي محاولة سابقة.";
          if (params.getAll("channel").length === 1 && params.get("channel") === "nondefault") msg += " قد تكون القناة دي مش الافتراضية؛ تغيير الافتراضية متوقف مؤقتًا لحماية وجهة النشر.";
        }
      }
      const notice = document.getElementById("acctNotice");
      if (notice) { notice.hidden = false; notice.style.display = "block"; notice.textContent = msg; notice.style.color = "#ffcf8b"; }
      if (typeof toast === "function") toast(msg);
      // احتفظ بمعلمات الرابط غير المتعلقة بالعودة حتى لا تضيع عند التنظيف.
      for (const key of ["setup", "linked", "w", "auto_error", "auto_resume", "channel"]) params.delete(key);
      const rest = params.toString();
      try { history.replaceState(null, "", window.location.pathname + window.location.search + "#/account" + (rest ? "?" + rest : "")); } catch {}
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
      const owner = this._accountOwner;
      if (btnC) {
        if (btnC.disabled || !owner || this._connectPending) return;
        if (btnC.dataset.connectIntent === "relink" || btnC.dataset.connectIntent === "add") {
          const seq = this._initSeq;
          const meta = CONNECT_PLATFORM[btnC.dataset.connect] === "meta";
          const msg = "اختيار الحساب يتم لدى المنصة، وليس من زر القناة هنا. إعادة الربط قد تضيف قناة أو تحدّث قناة أخرى، والإضافة قد تحدّث حسابًا موجودًا بدل إنشاء قناة جديدة. قد يُنشئ الربط أتمتة مفعّلة أو يضيف منصة لإعداد موجود؛ راجع القنوات والأتمتة بعد العودة." +
            (meta ? " قد يتأثر فيسبوك وإنستغرام معًا." : "") + " هل تريد المتابعة؟";
          let approved = false;
          try { approved = window.confirm(msg) === true; } catch { return; }
          if (!approved || owner !== this._accountOwner || seq !== this._initSeq || this._connectPending || !wrap.contains(btnC)) return;
        }
        // Only one start per tab at a time, including across a list rerender.
        // Provider state cookies can overlap (Facebook and Instagram share Meta).
        const attempt = Symbol("connect attempt"), platform = btnC.dataset.connect;
        this._connectPending = attempt; this._connectAttempt = attempt;
        const original = btnC.textContent;
        wrap.querySelectorAll("[data-connect]").forEach(button => { button.disabled = true; });
        btnC.textContent = "⏳ جارٍ التحويل…";
        const controller = new AbortController();
        let sent = false, timer;
        const deadline = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("deadline")); }, 20000); });
        const current = async () => {
          if (controller.signal.aborted || this._connectAttempt !== attempt || owner !== this._accountOwner) return false;
          let uid = null;
          try { uid = await window.AuthApp.getUserId(); } catch { /* unknown is not current */ }
          if (controller.signal.aborted || this._connectAttempt !== attempt || owner !== this._accountOwner) return false;
          if (uid === owner) return true;
          this.init().catch(() => {});
          return false;
        };
        const notify = message => {
          Promise.resolve().then(() => window.AuthApp.getUserId()).then(uid => {
            if (uid === owner && owner === this._accountOwner && this._connectAttempt === attempt && typeof toast === "function") toast(message, "err");
          }).catch(() => {});
        };
        try {
          const operation = (async () => {
            const token = await window.AuthApp.getToken();
            if (controller.signal.aborted || !(await current()) || controller.signal.aborted) return null;
            const url = connectPath(platform, token);
            if (!url) throw new Error("سجّل الدخول أولًا لربط القناة");
            sent = true;
            const res = await fetch(url, {method:"POST", signal:controller.signal, headers:{Authorization:`Bearer ${token}`}, credentials:"same-origin"});
            const data = await res.json().catch(() => ({}));
            if (controller.signal.aborted || !(await current()) || controller.signal.aborted) return null;
            if (!res.ok) throw new Error("تعذّر بدء الربط");
            let target;
            try { target = new URL(data.url); } catch { throw new Error("تعذّر التحقق من رابط الربط"); }
            const provider = CONNECT_PLATFORM[platform];
            const hosts = {youtube:"accounts.google.com",meta:"www.facebook.com",tiktok:"www.tiktok.com",x:"x.com"};
            if (target.protocol !== "https:" || target.hostname !== hosts[provider] || target.port || target.username || target.password) throw new Error("تعذّر التحقق من رابط الربط");
            return target.href;
          })();
          const target = await Promise.race([operation, deadline]);
          if (target && !controller.signal.aborted && this._connectAttempt === attempt && owner === this._accountOwner) window.location.href = target;
        } catch (error) {
          const message = error?.message === "تعذّر التحقق من رابط الربط" ? error.message
            : sent ? "تعذّر تأكيد بدء الربط ولم ننتقل للمنصة. قد يكون الخادم استقبل الطلب؛ ابدأ ربطًا جديدًا ولا تستخدم صفحة تفويض قديمة."
            : "لم يُرسل طلب الربط؛ تعذّر التحقق من الجلسة. راجع الحساب وحاول مجددًا.";
          notify(message);
        } finally {
          clearTimeout(timer); controller.abort();
          if (this._connectPending === attempt) this._connectPending = null;
          btnC.disabled = false; btnC.textContent = original;
          if (!this._connectPending) wrap.querySelectorAll("[data-connect]").forEach(button => { button.disabled = false; });
        }
        return;
      }
      const btnDef = e.target.closest("[data-default]");
      if (btnDef) {
        if (btnDef.disabled) return;
        const id = btnDef.dataset.default;
        if (!id) return;
        btnDef.disabled = true;
        try {
          const token = await window.AuthApp.getToken();
          if (!token || !(await this.accountStillCurrent(owner))) return;
          const res = await fetch("/api/gw?op=default", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ id }),
          });
          const data = await res.json().catch(() => ({}));
          if (!(await this.accountStillCurrent(owner))) return;
          if (!res.ok) throw new Error(data.error || "تعذّر تعيين القناة");
          if (typeof toast === "function") toast("⭐ صارت القناة الافتراضية للنشر");
          const nextToken = await window.AuthApp.getToken();
          if (await this.accountStillCurrent(owner)) await this.renderConnections(nextToken);
        } catch (error) {
          if (await this.accountStillCurrent(owner) && typeof toast === "function") toast(String(error?.message || error).slice(0, 120), "err");
        } finally { btnDef.disabled = false; }
        return;
      }
      if (btnD) {
        if (btnD.disabled) return;
        const id = btnD.dataset.unlink;
        if (!owner || !id) return;
        const pendingKey = JSON.stringify([owner, id]);
        if (!this._disconnectPending) this._disconnectPending = new Set();
        if (this._disconnectPending.has(pendingKey)) return;
        if (!confirm("طلب فك ربط هذا الحساب؟ قد تفقد المهام المجدولة وجهتها وتُنشر على قناة أخرى، وقد يستمر رفع بدأ بالفعل. إيقاف الأتمتة لا يلغي المهام الموجودة. راجع مهام النشر قبل المتابعة؛ إلغاء تصريح التطبيق لدى المنصة إجراء منفصل.")) return;
        this._disconnectPending.add(pendingKey);
        if (!this._disconnectAttempts) this._disconnectAttempts = new Map();
        const attempt = Symbol("disconnect attempt");
        this._disconnectAttempts.set(pendingKey, attempt);
        btnD.disabled = true;
        const controller = new AbortController();
        let sent = false;
        // Abort alone cannot bound a stalled token lookup, identity check, or
        // JSON reader. The deadline covers all of them, and a late continuation
        // must never send the destructive request after the deadline.
        let timer;
        const deadline = new Promise((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error("deadline")); }, 20000);
        });
        const current = async () => {
          if (controller.signal.aborted || !owner || owner !== this._accountOwner) return false;
          let uid = null;
          try { uid = await window.AuthApp.getUserId(); } catch { /* unknown is not current */ }
          if (controller.signal.aborted || owner !== this._accountOwner) return false;
          if (uid === owner) return true;
          this.init().catch(() => {});
          return false;
        };
        // Do not let a stalled identity lookup keep the button disabled, or
        // show a message belonging to an account that has since changed.
        const notify = message => {
          Promise.resolve().then(() => window.AuthApp.getUserId()).then(uid => {
            if (uid === owner && owner === this._accountOwner && this._disconnectAttempts.get(pendingKey) === attempt && typeof toast === "function") toast(message, "err");
          }).catch(() => {});
        };
        try {
          const operation = (async () => {
            const token = await window.AuthApp.getToken();
            if (controller.signal.aborted || !(await current()) || controller.signal.aborted) return false;
            if (!token) throw new Error("no token");
            sent = true;
            const res = await fetch("/api/gw?op=disconnect", {
              method: "POST", signal: controller.signal,
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ id }),
            });
            const data = await res.json().catch(() => ({}));
            if (controller.signal.aborted || !(await current()) || controller.signal.aborted) return false;
            if (!res.ok || data.ok !== true || data.deleted !== true) throw new Error("unconfirmed");
            return true;
          })();
          if (await Promise.race([operation, deadline])) {
            if (typeof toast === "function") toast("✓ تم طلب فك الربط؛ راجع قائمة القنوات والمهام المجدولة");
            // Refresh is independent of the bounded request; its own sequence
            // and owner guards prevent stale channel results from rendering.
            Promise.resolve().then(async () => {
              const token = await window.AuthApp.getToken();
              if (await this.accountStillCurrent(owner)) await this.renderConnections(token);
            }).catch(() => {});
          }
        } catch {
          notify(sent
            ? "تعذّر تأكيد فك الربط. قد يكون الطلب وصل؛ حدّث القنوات وراجع المهام قبل إعادة المحاولة."
            : "لم يُرسل طلب فك الربط؛ تعذّر التحقق من الجلسة في الوقت المحدد. راجع الحساب وحاول مجددًا.");
        } finally {
          clearTimeout(timer); controller.abort();
          this._disconnectPending.delete(pendingKey);
          btnD.disabled = false;
          if (owner === this._accountOwner) {
            wrap.querySelectorAll("[data-unlink]").forEach(button => { if (button.dataset.unlink === id) button.disabled = false; });
          }
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
    const msg = "جدولة الفيديو المُصدَّر يدويًا غير متاحة حاليًا. يمكنك تحميل الفيديو ونشره بنفسك، أو ضبط النشر التلقائي من صفحة حسابي.";
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
      // مبدّل الأتمتة يعالجه حدث change؛ لا تمنع سلوك checkbox الافتراضي.
      if (!act || act === "toggle-enabled") return;
      e.preventDefault();
      if (act === "pause-safely") return this.pauseSafely(el);
      if (act === "recheck-settings") return this.reviewSettings();
      if (act === "resume-settings") return this.resumeSettings();
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
      const expected = this.data?.config?.settings_revision;
      if (this._settingsPending || this._settingsUncertain) { t.checked = !want; return; }
      const owner = this._accountOwner;
      this._initSeq = (this._initSeq || 0) + 1;
      this._settingsPending = true;
      t.disabled = true;
      const save = document.getElementById("autoSave");
      if (save) save.disabled = true;
      let out;
      try { out = await this.api("set_enabled", { enabled: want, expected_revision: expected }, owner); }
      catch (e) { out = e?.beforeSend ? { ok: false, beforeSend: true, error: e.message } : { ok: false, uncertain: true }; }
      this._settingsPending = false;
      if (owner !== this._accountOwner) { this.init(); return; }
      if (save) save.disabled = false;
      if (out.ok && out.enabled === want && this.validAccountConfig(out.config) && out.config.settings_revision && typeof out.stale === "boolean") {
        const draftStale = this._autoDirty && (out.stale || this._draftRevision !== expected);
        this.data = { ...(this.data || {}), config: out.config };
        if (draftStale) {
          // الإيقاف نجح حتى لو كانت المسودة قديمة، لكن لا نرفع نسختها تلقائيًا.
          this._settingsUncertain = true; this._reviewedUncertain = false;
          this.showUncertainty(); this.renderStatus(this.data);
          if (typeof toast === "function") toast("تم تغيير الحالة، لكن المسودة أقدم من إعدادات الخادم؛ راجعها قبل الحفظ", "err");
        } else {
          this._draftRevision = out.config.settings_revision;
          t.disabled = false;
          this.renderStatus(this.data); this.renderSteps(this.data);
          if (!this._autoDirty) this.renderAutoPanel(this.data);
          if (typeof toast === "function") toast(want ? "✅ الأتمتة مفعّلة بالإعدادات المحفوظة" : "⏸️ الأتمتة اتوقفت — إعدادات النشر محفوظة");
        }
      } else if (out.code === "settings_conflict" || out.code === "revision_required" || out.uncertain || (!out.beforeSend && ![400, 401, 403, 409, 413, 422].includes(out.status)) || out.ok) {
        this._settingsUncertain = true; this._reviewedUncertain = false; this.showUncertainty();
        if (save) save.disabled = true;
        this.renderStatus(this.data);
        if (typeof toast === "function") toast("تعذّر تأكيد الحالة أو تغيّرت الإعدادات؛ تحقق من الخادم", "err");
      } else {
        t.disabled = false;
        t.checked = !want;
        if (typeof toast === "function") toast(String(out.error || "تعذّر تغيير حالة الأتمتة"), "err");
      }
    });
  },

  async api(action, payload = {}, expectedOwner = this._accountOwner) {
    let token;
    try {
      token = await window.AuthApp.getToken();
      if (expectedOwner && (expectedOwner !== this._accountOwner || await window.AuthApp.getUserId() !== expectedOwner || expectedOwner !== this._accountOwner || !token)) throw new Error("الحساب اتغيّر أو انتهت الجلسة قبل إرسال الطلب؛ راجع الحساب وحاول تاني");
    } catch (cause) {
      const error = new Error(cause?.message || "تعذّر التحقق من الحساب قبل إرسال الطلب"); error.beforeSend = true; throw error;
    }
    const res = await fetch("/api/autopilot", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    return { ...data, ok: res.ok && data.ok !== false, status: res.status };
  },

  // Normalize the user-selected image locally. Canvas drops EXIF / location metadata.
  async prepareAccountImage(file) {
    if (!file || !['image/jpeg','image/png'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error("اختار صورة JPEG أو PNG بحجم لا يتجاوز ١٠ ميجابايت");
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error("تعذّر قراءة الصورة")); img.src = url; });
      if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 40000000) throw new Error("أبعاد الصورة أكبر من المسموح");
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("تعذّر تجهيز الصورة");
      ctx.fillStyle = "#000"; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0,canvas.width,canvas.height);
      for (const quality of [0.88, 0.75, 0.6, 0.45, 0.3]) {
        const data = canvas.toDataURL("image/jpeg", quality);
        if (data.startsWith("data:image/jpeg;base64,") && data.length <= 699075) return data;
      }
      throw new Error("الصورة كبيرة حتى بعد تصغيرها؛ جرّب صورة أخرى");
    } finally { URL.revokeObjectURL(url); }
  },

  /* حفظ كل التخصيصات (المحتوى/القارئ/الخلفية/المنصات/الحالة) */
  async saveSettings({ enabled, silent = false, btn = null } = {}) {
    if (this._settingsPending || this._settingsUncertain) return { ok: false, error: "راجع حالة الأتمتة قبل الحفظ" };
    if (!this.validRevision(this._draftRevision)) return { ok: false, error: "تعذّر تأكيد إصدار المسودة؛ حدّث الصفحة" };
    const q2 = (id) => document.getElementById(id);
    const revealField = (id, appearance = false) => {
      const customize = q2("acctCustomize"); if (customize) customize.open = true;
      const detail = q2("acctAppearance"); if (appearance && detail) detail.open = true;
      q2(id)?.focus();
    };
    const platforms = [...document.querySelectorAll("#acctPlatforms input[data-platform]:checked:not(:disabled)")].map((i) => i.dataset.platform);
    const reciter = q2("acctReciter") ? q2("acctReciter").value : "";
    const template = {
      content_mode: q2("selContentMode") ? q2("selContentMode").value : "mix",
      background: q2("selBackground") ? q2("selBackground").value : "rotate",
      reciter_mode: reciter ? "fixed" : "rotate",
      reciter: reciter || "",
      privacy: "public",
    };
    const imageFile = template.background === "custom" ? q2("acctBackgroundFile")?.files[0] : null;
    if (template.background === "custom" && !imageFile) {
      // Keep the image selected when this draft began; a background refresh
      // must not silently substitute another tab's later image.
      template.background_image_id = this._draftBackgroundImageId;
      if (!template.background_image_id) { revealField("acctBackgroundFile", true); if (typeof toast === "function") toast("اختار صورة من جهازك أولًا", "err"); return { ok:false, error:"اختار صورة من جهازك أولًا" }; }
    }
    if (template.content_mode === "fixed") {
      template.surah = Number(q2("acctSurah")?.value); template.from = Number(q2("acctFrom")?.value); template.to = Number(q2("acctTo")?.value);
      const count = typeof Quran !== "undefined" ? Quran.ayahCount(template.surah) : 0;
      if (!count || !Number.isInteger(template.from) || !Number.isInteger(template.to) || template.from < 1 || template.to < template.from || template.to > count || template.to - template.from >= 40) {
        revealField(count ? "acctFrom" : "acctSurah");
        if (typeof toast === "function") toast("اختار آيات صحيحة من السورة (حد أقصى ٤٠ آية)", "err");
        return { ok: false, error: "آيات غير صالحة" };
      }
    }
    if (q2("acctDesignEnabled")?.checked) template.design = {
      translation: q2("acctTranslation").value, showTrans: q2("acctShowTrans").checked, style: q2("acctStyle").value,
      ratio: q2("acctRatio").value, quality: Number(q2("acctQuality").value), accent: q2("acctAccent").value,
      fontSize: Number(q2("acctFont").value), showWatermark: q2("acctWatermark").checked, motion: q2("acctMotion").checked, dedText: q2("acctDed").value,
    };
    const enabledNow = enabled !== undefined ? Boolean(enabled) : Boolean(q2("acctEnabled") && q2("acctEnabled").checked);
    const body = { expected_revision: this._draftRevision, enabled: enabledNow, platforms, template, all_channels: q2("chkAllChannels") ? Boolean(q2("chkAllChannels").checked) : this._draftAllChannels === true };

    const old = btn ? btn.textContent : "";
    const toggle = q2("acctEnabled");
    const editRevision = this._autoEditRevision || 0;
    const owner = this._accountOwner;
    this._initSeq = (this._initSeq || 0) + 1;
    this._settingsPending = true;
    if (toggle) toggle.disabled = true;
    if (btn) { btn.disabled = true; btn.textContent = "⏳ جارٍ الحفظ…"; }
    let out = { ok: false }, sent = false;
    try {
      if (imageFile) body.custom_image = await this.prepareAccountImage(imageFile);
      sent = true;
      out = await this.api("save", body, owner);
    } catch (e) {
      if (!sent && imageFile && owner === this._accountOwner) revealField("acctBackgroundFile", true);
      out = { ok: false, uncertain: sent && !e?.beforeSend, beforeSend: Boolean(e?.beforeSend), error: e?.message || "تعذّر الاتصال بالخادم" };
    }
    const confirmed = out.ok && this.savedMatches(out.config, body);
    const uncertain = sent && !out.beforeSend && (out.uncertain || (out.ok && !confirmed) || (!out.ok && ![400, 401, 403, 409, 413, 422].includes(out.status)));
    if (uncertain) out = { ...out, ok: false, uncertain: true, error: "تعذّر تأكيد نتيجة الحفظ؛ تحقق من الخادم قبل المحاولة" };
    this._settingsPending = false;
    if (owner !== this._accountOwner) { this.init(); return out; }
    if (toggle) toggle.disabled = false;
    if (btn) { btn.disabled = false; btn.textContent = old; }

    if (uncertain || out.code === "settings_conflict" || out.code === "revision_required") {
      this._autoDirty = true; this._settingsUncertain = true; this._reviewedUncertain = false;
      this.renderEditState(); this.showUncertainty(); this.renderStatus(this.data || {});
      if (typeof toast === "function") toast(out.error || "راجع إعدادات الخادم", "err");
    } else if (confirmed) {
      // لا نعتبر تعديلًا حدث أثناء طلب الحفظ جزءًا من الاستجابة السابقة.
      this._autoDirty = (this._autoEditRevision || 0) !== editRevision;
      this._draftRevision = out.config.settings_revision;
      this._draftBackgroundImageId = out.config.template.background === "custom" ? out.config.template.background_image_id : null;
      this._draftAllChannels = out.config.all_channels === true;
      this.renderEditState();
      this.data = { ...(this.data || {}), config: { ...((this.data || {}).config || {}), ...(out.config || {}), enabled: enabledNow, platforms, template: out.config?.template || template, all_channels: body.all_channels } };
      if (imageFile && q2("acctBackgroundFile")?.files[0] === imageFile) q2("acctBackgroundFile").value = "";
      this._bgPreviewCache = null;
      this.renderStatus(this.data);
      this.renderSteps(this.data);
      if (!silent && typeof toast === "function") toast("✅ تم حفظ التعديلات");
    } else if (typeof toast === "function") toast(String(out.error || "تعذّر الحفظ"), "err");
    return out;
  },

  async runNow(kind, btn) {
    if (this._settingsPending || this._settingsUncertain) {
      if (typeof toast === "function") toast("راجع حالة الإعدادات أولًا قبل التشغيل اليدوي", "err"); return;
    }
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
        if (typeof toast === "function") toast("اكتمل التشغيل — راجع حالة القنوات والسجل" + extra);
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
    if (this._settingsPending || this._settingsUncertain) {
      if (typeof toast === "function") toast("راجع حالة الإعدادات أولًا قبل التشغيل اليدوي", "err"); return;
    }
    if (this._runPending) return;
    if (!confirm("سيُنشأ فيديو من مقال ويُحاول نشره فورًا بالإعدادات المحفوظة، وليس مسودة للمعاينة. هل تريد المتابعة؟")) return;
    this._runPending = true;
    if (btn) btn.disabled = true;
    try {
      const out = await this.api("article_random");
      if (out.ok) {
        if (typeof toast === "function") toast(`📚 ${out.article_title || "مقال"} — راجع حالة النشر في السجل`);
        else alert(`📚 ${out.article_title || "مقال"} — راجع حالة النشر في السجل`);
      } else if (typeof toast === "function") toast(String(out.error || "تعذّر التوليد من مقال"), "err");
    } catch {
      if (typeof toast === "function") toast("الاتصال اتقطع؛ راجع حالة التشغيل قبل ما تحاول تاني", "err");
    } finally {
      this._runPending = false;
      if (btn) btn.disabled = false;
    }
  },

  async retryPublish(btn) {
    if (btn) { btn.disabled = true; btn.textContent = "⏳ جارٍ الفحص…"; }
    try {
      const out = await this.api("retry_publish");
      if (out.ok) { if (typeof toast === "function") toast("تم نشر الفيديو الجاهز ✅"); return this.init(); }
      if (typeof toast === "function") toast(String(out.error || "تعذّر النشر — أعد الربط أولًا"), "err");
    } catch {
      if (typeof toast === "function") toast("تعذّر الاتصال بالخادم", "err");
    }
    if (btn) { btn.disabled = false; btn.textContent = "🔍 افحص محاولات أتمتة اليوم الفاشلة"; }
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
  let wired = false, signOutAttempt = 0;

  async function signOut() {
    const button = $("acctSignOut"), status = $("acctSignOutStatus");
    let user = null;
    try { user = QRAuth.user(); } catch {}
    if (!user || button?.disabled) return;
    if (!confirm("تسجيل الخروج من هذا المتصفح؟ قد تفقد تعديلات غير محفوظة. الخروج لا يوقف الأتمتة ولا يلغي مهام النشر.")) return;
    const attempt = ++signOutAttempt;
    if (button) button.disabled = true;
    if (status) { status.hidden = false; status.textContent = "جارٍ إنهاء الجلسة والتحقق من رد الخادم…"; }
    try {
      const result = await QRAuth.signOut();
      if (result?.session_changed) {
        if (status && QRAuth.user() === result.current_user) {
          status.hidden = false;
          status.textContent = "تغيّرت الجلسة في تبويب آخر قبل الخروج؛ راجع الحساب الحالي وحاول مجددًا إذا أردت تسجيل خروجه.";
        }
        return;
      }
      if (attempt !== signOutAttempt || QRAuth.user()) return;
      const local = result?.local_cleared
        ? "تم مسح الجلسة المحلية من هذا المتصفح."
        : "تعذّر تأكيد إزالة الجلسة من تخزين المتصفح؛ امسح بيانات الموقع على هذا الجهاز.";
      const remote = result?.remote === "confirmed"
        ? " تلقّى الخادم طلب إنهاء الجلسة؛ قد يظل رمز دخول سبق إصداره صالحًا حتى تنتهي صلاحيته."
        : " لم يتأكد إنهاء الجلسة لدى الخادم؛ قد يظل رمز الدخول صالحًا حتى تنتهي صلاحيته.";
      if (status) { status.hidden = false; status.textContent = local + remote + " الأتمتة والمهام لا تتوقف بتسجيل الخروج."; }
    } catch {
      if (attempt === signOutAttempt && status) { status.hidden = false; status.textContent = "تعذّر تأكيد نتيجة الخروج؛ تحقّق من الجلسة وامسح بيانات الموقع إن لزم. الأتمتة والمهام لا تتوقف بالخروج."; }
    } finally { if (button) button.disabled = false; }
  }

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

    $("acctSignOut")?.addEventListener("click", signOut);
    $("loginSubmit")?.addEventListener("click", submitEmail);
    $("loginEmail")?.addEventListener("keydown", (e) => { if (e.key === "Enter") submitEmail(); });
    $("loginGoogle")?.addEventListener("click", () => { try { QRAuth.google(); } catch {} });
    $("loginClose")?.addEventListener("click", close);
    $("loginOverlay")?.addEventListener("click", (e) => { if (e.target === e.currentTarget) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen()) close(); });

    try {
      QRAuth.on((u) => {
        const b = $("authBtn"), exit = $("acctSignOut"), status = $("acctSignOutStatus");
        if (b) b.textContent = u ? "🟢 حسابي" : "🔑 دخول";
        if (exit) exit.hidden = !u;
        if (u?.id) { signOutAttempt++; if (status) status.hidden = true; close(); }
        // Logout should not automatically reopen the login dialog.
        if (u?.id && /^#\/account(\?|$)/.test(window.location.hash || "")) window.PublishApp.init();
      });
      const b = $("authBtn"), exit = $("acctSignOut");
      if (b) b.textContent = QRAuth.user() ? "🟢 حسابي" : "🔑 دخول";
      if (exit) exit.hidden = !QRAuth.user();
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

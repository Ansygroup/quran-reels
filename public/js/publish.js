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
        if (notice) notice.textContent = "سجّل الدخول (من زر الحساب بالأعلى) لعرض لوحة النشر والأتمتة.";
        return;
      }
      alert(data.error || "خطأ في تحميل البيانات");
      return;
    }
    
    this.renderAccount(data);
    this.bindEvents(uid);
    // حالة الربط الحقيقية — تُقرأ من op=list (الخادم لا يرسل التوكنات أبدًا)
    await this.renderConnections(await window.AuthApp.getToken());
    this.reportLinkedFlag();
  },

  renderAccount(data = {}) {
    // قيم افتراضية: بيانات ناقصة لا تُسقط الصفحة كلها (كانت الاستجابة {} كافية للانهيار)
    const config = data.config || {};
    const runs = Array.isArray(data.runs) ? data.runs : [];
    const connected = Boolean(data.connected);
    const platforms = Array.isArray(data.platforms) ? data.platforms : [];
    const channel = data.channel || "لا توجد قنوات مرتبطة";
    const reciters = Array.isArray(data.reciters) ? data.reciters : [];
    const articleCount = data.articles && Number(data.articles.count) > 0 ? Number(data.articles.count) : null;
    const articleLabel = articleCount ? `توليد من مقال (${articleCount.toLocaleString("ar-EG")} مقال)` : "توليد من مقال";
    const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    /* ترجمة الأسباب الخام لصفوف قديمة كُتبت قبل G44: invalid_grant لا تعني
     * شيئًا لمن يقرأها. الصفوف المحفوظة لا تتغيّر، فنُصلح العرض لا التخزين. */
    const friendly = (v) => {
      const t = String(v || "");
      if (/invalid_grant|expired or revoked|unauthorized_client/i.test(t)) {
        return "انتهت صلاحية ربط " + (/tiktok/i.test(t) ? "تيك توك" : /\bx\b|twitter/i.test(t) ? "X" : "يوتيوب") + " — أعد الربط من بطاقة الحسابات";
      }
      if (/quotaExceeded|exceeded your quota/i.test(t)) return "تجاوز الحد اليومي للرفع على يوتيوب — يُعاد تلقائيًا";
      return t;
    };
    /* آخر فحص محفوظ في القاعدة: «هل التوليد يعمل؟» يُجاب في اللوحة نفسها
     * بدل لقطة شاشة تُنسى. النصوص من الخادم تُقصّ وتُهرَّب. */
    const lastCheckLine = (c) => {
      if (!c || !c.created_at) return "";
      const when = new Date(c.created_at);
      const stamp = Number.isNaN(when.getTime()) ? "" : when.toISOString().slice(0, 16).replace("T", " ") + " UTC";
      const kind = c.kind === "render_selftest_deep" ? "توليد تجريبي"
        : c.kind === "render_failure" ? "محاولة توليد آلية"
        : c.kind === "autopilot_daily" ? "تشغيل آلي" : "فحص المحرّك";
      let why = !c.ok && c.detail && c.detail.error ? " — " + friendly(String(c.detail.error).slice(0, 120)) : "";
      /* فحص فاشل بلا سبب مكتوب لكن التلاوة نفسها لم تصل: نسمّيها بدل «غير معروف» */
      const d = c.detail || {};
      if (!c.ok && !why && d.audio_direct && d.audio_direct.ok === false) {
        why = " — التلاوة غير متاحة من الخادم" + (d.audio_proxy && d.audio_proxy.ok ? " (المسار المباشر فقط)" : "");
      }
      if (!c.ok && d.export && d.export.stage && !/stage/.test(why)) {
        why += (why ? " · " : " — ") + "توقّف عند «" + String(d.export.stage).slice(0, 60) + "»";
      }
      const cls = c.ok ? "hint ok" : "hint warn";
      return `<p class="${cls}" id="acctLastCheck">آخر ${kind} محفوظ: ${c.ok ? "✅ ناجح" : "⚠️ فاشل"}${esc(why)} · ${stamp}</p>`;
    };
    this.lastCheckLine = lastCheckLine(data.last_check);

    /* «هل الشغل بيمشي لوحده؟» — سطر واحد يقول حالة آخر تشغيل آلي: يومه،
     * حالته، سببه، ورابط المنشور. بدونه كان الفشل صامتًا حتى يفتح أحدهم
     * قاعدة البيانات. النصوص تأتي من الخادم فتُهرَّب. */
    const lastDailyLine = (d) => {
      if (!d || !d.run_date) return "";
      const day = String(d.run_date).slice(0, 10);
      const published = d.status === "published";
      const running = d.status === "rendering";
      const state = published ? "✅ منشور" : running ? "⏳ قيد التوليد" : "⚠️ فشل";
      const why = !published && !running && d.error ? " — " + friendly(String(d.error).slice(0, 140)) : "";
      const link = published && d.external_url
        ? ` · <a href="${esc(d.external_url)}" target="_blank" rel="noopener">رابط المنشور</a>` : "";
      return `<p class="hint ${published ? "ok" : running ? "" : "warn"}" id="acctLastDaily">آخر تشغيل آلي (${esc(day)}): ${state}${esc(why)}${link} · يُعاد تلقائيًا كل يوم 12:15 القاهرة إن تعذّر</p>`;
    };
    this.lastDailyLine = lastDailyLine(data.last_daily);

    /* تفاصيل آخر فشل توليد: التشخيص كان يُحفظ في القاعدة ولا يراه أحد، فيبقى
     * السبب «غير معروف» للمستخدم. هنا نعرض المرحلة ونسبة التقدّم وهل بدأ
     * التصدير والتنبيه/سبب الإيقاف وأول أخطاء الصفحة — كلها مُهرَّبة. */
    const diagBox = (c) => {
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
        rows.map(([k, v]) => `<li>${esc(k)}: ${esc(v)}</li>`).join("")
      }${errs.length ? `<li>أخطاء الصفحة: ${esc(errs.join(" | "))}</li>` : ""}</ul></details>`;
    };
    this.lastDiagBox = diagBox(data.last_check);

    /* ربط منتهٍ (invalid_grant): الخطأ الخام لا يقول للمستخدم ماذا يفعل. هنا
     * نقولها صريحة + أن الفيديو الجاهز سيُنشر بعد الربط بلا إعادة توليد. */
    const reauthLine = (list) => {
      const arr = (Array.isArray(list) ? list : []).filter((p) => typeof p === "string" && p);
      /* صفّ قديم يقول invalid_grant قبل أن يوجد حقل reauth ⇒ نستنتج المنصة منه */
      if (!arr.length) {
        const raw = `${(data.last_daily && data.last_daily.error) || ""} ${(data.last_check && data.last_check.detail && data.last_check.detail.error) || ""}`;
        if (/invalid_grant|expired or revoked|unauthorized_client/i.test(raw)) {
          arr.push(/tiktok/i.test(raw) ? "tiktok" : /youtube/i.test(raw) ? "youtube" : "youtube");
        }
      }
      if (!arr.length) return "";
      const names = arr.map((p) => esc(PLATFORMS[p] || p)).join("، ");
      return `<p class="hint warn" id="acctReauth">⚠️ ${names}: انتهى ربط القناة — اضغط «🔄 إعادة الربط» في بطاقة الحسابات أدناه، ثم «🔁 انشر الفيديو الجاهز» فلن يُولَّد فيديو جديد.</p>
        <div class="row gap-lg"><button class="btn btn-gold" id="btnRetryPublish">🔁 انشر الفيديو الجاهز</button></div>`;
    };
    this.lastReauthLine = reauthLine(data.reauth);
    this.reauth = Array.isArray(data.reauth) ? data.reauth.slice() : [];

    // الخادم يرسل available (مفتاح/اسم/هل النشر مدعوم) — لا نَعِد بما لا يُنشر
    this.available = Array.isArray(data.available) && data.available.length
      ? data.available
      : ALL_PLATFORMS.map((k) => ({ key: k, name: PLATFORMS[k] || k, publish: true }));
    
    // بطاقة الإجراءات السريعة
    const quickActions = document.getElementById("acctQuickActions");
    if (quickActions) {
      quickActions.hidden = false;
      quickActions.innerHTML = `
        <h2>⚡ إجراءات سريعة</h2>
        <div class="row gap-lg">
          <button class="btn btn-gold" id="quickGenArticle">${articleLabel}</button>
          <button class="btn btn-em" id="quickRunAll">تشغيل الأتمتة (توازي)</button>
          <button class="btn btn-ghost" id="quickSelfTest">🔍 فحص محرّك التوليد</button>
          <button class="btn btn-ghost" id="quickRenderTest">🎬 اختبار توليد فيديو</button>
        </div>
        ${this.lastReauthLine || ""}
        ${this.lastDailyLine || ""}
        ${this.lastCheckLine || ""}
        ${this.lastDiagBox || ""}
      `;
    }
    /* زر نشر الفيديو الجاهز: يظهر فقط عند وجود منصة تحتاج إعادة ربط، ويستدعي
     * إجراءً ينشر صفوف اليوم الفاشلة بدل إعادة التوليد من الصفر. */
    const retryBtn = document.getElementById("btnRetryPublish");
    if (retryBtn && !retryBtn._bound) {
      retryBtn._bound = true;
      retryBtn.addEventListener("click", async () => {
        retryBtn.disabled = true;
        const old = retryBtn.textContent;
        retryBtn.textContent = "⏳ جارٍ النشر…";
        try {
          const res = await fetch("/api/autopilot", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${await window.AuthApp.getToken()}` },
            body: JSON.stringify({ action: "retry_publish" }),
          });
          const j = await res.json().catch(() => ({}));
          if (j && j.ok) {
            if (typeof toast === "function") toast("تم نشر الفيديو الجاهز ✅");
            location.reload();
            return;
          }
          if (typeof toast === "function") toast(String((j && j.error) || "تعذّر النشر — أعد الربط أولًا"), "err");
        } catch {
          if (typeof toast === "function") toast("تعذّر الاتصال بالخادم", "err");
        }
        retryBtn.disabled = false;
        retryBtn.textContent = old;
      });
    }


    // بطاقة الربط (تعدد القنوات)
    const acctPlatforms = document.getElementById("acctPlatforms");
    if (acctPlatforms) {
      acctPlatforms.innerHTML = this.available.map(p => `
        <div class="f-group" style="flex:1">
          <label>${p.name}${p.publish ? "" : " <small>(قريبًا)</small>"}</label>
          <input type="checkbox" id="plat-${p.key}" ${platforms.includes(p.key) ? 'checked' : ''} data-platform="${p.key}"
            ${p.publish ? "" : 'disabled title="لا يوجد ربط/نشر لهذه المنصة بعد"'} style="width:100%">
        </div>
      `).join("");
    }

    // جدول النشر
    const acctQueue = document.getElementById("acctQueue");
    if (acctQueue) {
      // نملأ الحاوية الموجودة (#schedPlatforms) بالمدخلات فقط — بلا تكرار للمُعرّف
      const platformInputs = this.available.map(p =>
        `<div class="f-group" style="flex:1"><label><input type="checkbox" data-platform="${p.key}" ${p.publish ? "" : "disabled"}> ${p.name}</label></div>`
      ).join("");
      const schedWrap = acctQueue.querySelector("#schedPlatforms");
      if (schedWrap) schedWrap.innerHTML = platformInputs;
      
      const queueList = document.getElementById("queueList");
      if (queueList && Array.isArray(runs)) {
        queueList.innerHTML = runs.map(r => `
          <div class="auto-run ${r.status}">
            <div class="auto-run-head">
              <span class="auto-run-title">${r.title || `سورة ${r.recipe_key?.split(':')[0]}`}</span>
              <span class="auto-run-date">${cairoClockLabel(r.created_at)}</span>
            </div>
            <div class="auto-run-body">
              <span class="auto-run-reciter">${r.reciter || "غير معروف"}</span>
              <span class="auto-run-status">${r.status === 'published' ? '✅ منشور' : r.status === 'rendering' ? '⏳ قيد الإنشاء' : '❌ فشل'}</span>
              ${r.article_title ? `<span class="auto-run-article">📚 مقال: ${r.article_title}</span>` : ''}
            </div>
            ${r.external_url ? `<div class="auto-run-url"><a href="${r.external_url}" target="_blank">🔗 رابط النشر</a></div>` : ''}
            ${r.error ? `<div class="auto-run-error">⚠️ ${r.error}</div>` : ''}
          </div>
        `).join("");
      }
    }

    // لوحة الأتمتة (تعدد القنوات والتوازي والمقالات)
    /* خيار «انشر على كل القنوات المرتبطة» — يظهر فقط عند ربط قناتين فأكثر لنفس المنصة */
    const allChannelsOn = data.config && data.config.all_channels === true;
    const chanCount = new Map();
    for (const c of Array.isArray(this.connections) ? this.connections : []) chanCount.set(c.platform, (chanCount.get(c.platform) || 0) + 1);
    const multiChannel = [...chanCount.values()].some((n) => n > 1);
    const acctAuto = document.getElementById("acctAuto");
    if (acctAuto) {
      acctAuto.innerHTML = `
        <h2>⚙️ لوحة الأتمتة اليومية</h2>
        <div class="row gap-lg">
          <div class="f-group" style="flex:1">
            <label>الحالة</label>
            <div class="status-badge ${config.enabled ? 'active' : 'inactive'}">${config.enabled ? '✅ مفعلة' : '❌ معطلة'}</div>
          </div>
          <div class="f-group" style="flex:1">
            <label>الوقت (القاهرة)</label>
            <div class="status-badge">${cairoClockLabel("04:15:00")}</div>
          </div>
          <div class="f-group" style="flex:1">
            <label>المنصات</label>
            <div class="status-badge">${channel || 'لا توجد قنوات'}</div>
          </div>
        </div>
        ${multiChannel ? `<div class="switch-row" style="margin-top:14px">
          <div class="t">انشر على كل القنوات المرتبطة<small>عند التعطيل يُنشر على القناة الافتراضية (⭐) فقط · عندك ${[...chanCount.entries()].filter(([, n]) => n > 1).map(([k, n]) => `${PLATFORMS[k] || k}: ${n}`).join(" · ")}</small></div>
          <label class="switch"><input type="checkbox" id="chkAllChannels" ${allChannelsOn ? "checked" : ""}><i></i></label>
        </div>` : ""}
        <div class="row gap-lg" style="margin-top:12px">
          <button class="btn btn-gold" id="autoSave">حفظ الإعدادات</button>
          <button class="btn btn-em" id="autoRun">تشغيل الآن</button>
          <button class="btn btn-em" id="autoRunAll">تشغيل التوازي (الكل)</button>
          <button class="btn btn-gold" id="autoGenArticle">${articleLabel}</button>
        </div>
        
        <!-- بطاقة المقال (العدد الحقيقي يأتي من الخادم) -->
        <div id="acctArticles" class="card" style="margin-top:18px;display:none">
          <h2>📚 مكتبة المقالات${articleCount ? ` (${articleCount.toLocaleString("ar-EG")})` : ""}</h2>
          <div class="row gap-lg" id="articleCards">
            <!-- سيتم ملؤها بواسطة JavaScript (نمط .article-card) -->
          </div>
        </div>
      `;
    }

  },


  /* قائمة الحسابات المرتبطة + أزرار ربط/فك ربط لكل منصة */
  async renderConnections(token) {
    const card = document.getElementById("acctAccounts");
    const wrap = document.getElementById("acctAccountsList");
    if (!card || !wrap) return;
    card.hidden = false;
    wrap.innerHTML = '<p class="hint">جارٍ تحميل الحسابات المرتبطة…</p>';

    let conns = [];
    try {
      const res = await fetch("/api/gw?op=list", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      conns = Array.isArray(data.connections) ? data.connections : [];
    } catch { /* لا نُسقط الصفحة إن فشل الطلب */ }
    this.connections = conns;

    const row = (p) => {
      const mine = conns.filter((c) => c.platform === p.key);
      const prov = p.connect || CONNECT_PLATFORM[p.key];
      /* ready من الخادم: هل مفاتيح المزوّد مضبوطة في هذه البيئة؟ إن لم تكن،
       * فالزر كان يعيد المستخدم إلى ?setup=meta بلا أي تفسير. */
      const ready = p.ready !== false;
      const head = `<b style="min-width:96px">${p.name}</b>`;
      /* تحذير «أعد الربط» صار للحالات الحقيقية فقط: منصة تحتاج إعادة ربط أو
       * اتصال بلا توكن تجديد. صلاحية access_token تنتهي كل ساعة وتُجدَّد تلقائيًا،
       * فكان التحذير يظهر كل يوم بلا سبب ويفقد معناه. */
      const reauthList = Array.isArray(this.reauth) ? this.reauth : [];
      const expired = (c) => reauthList.includes(c.platform) || c.has_refresh === false;
      if (mine.length) {
        /* كل قناة في سطرها: الشارة «⭐ افتراضية» أو زر تعيينها، + إضافة قناة أخرى.
         * (قبل ذلك كان النشر يذهب دائمًا لأحدث قناة بلا أي اختيار ظاهر) */
        const chan = (c) => `<span class="soc-chan" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;width:100%">
          <span style="color:${expired(c) ? "#ffcf8b" : "#7ee0a2"}">${expired(c) ? "⚠️" : "✅"} ${String(c.account_name || "مرتبط").slice(0, 40)}</span>
          ${c.is_default ? '<span class="hint ok">⭐ افتراضية</span>' : `<button class="btn btn-ghost" data-default="${c.id}">⭐ اجعلها الافتراضية</button>`}
          ${expired(c) ? '<small class="hint">انتهت صلاحية الربط — أعد الربط لتُنشر الفيديوهات</small>' : '<small class="hint">الجلسة تتجدد تلقائيًا</small>'}
          <button class="btn btn-ghost" data-unlink="${c.id}" data-platform="${p.key}">فك الربط</button>
          ${prov && ready ? `<button class="btn btn-ghost" data-connect="${p.key}">🔄 إعادة الربط</button>` : ""}
        </span>`;
        return `<div class="soc-row" data-soc="${p.key}" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          ${head}
          ${mine.map(chan).join("")}
          ${prov && ready ? `<button class="btn btn-ghost" data-connect="${p.key}">➕ إضافة قناة</button>` : ""}
          <small class="hint">يُنشر على القناة الافتراضية (⭐). أضف قناة ثانية بتسجيل الدخول بحساب جوجل الذي يملكها.</small>
        </div>`;
      }
      if (!prov) {
        return `<div class="soc-row" data-soc="${p.key}" style="display:flex;align-items:center;gap:10px">
          ${head}<span class="hint">قريبًا — لا يوجد ربط/نشر لهذه المنصة بعد</span>
        </div>`;
      }
      if (!ready) {
        return `<div class="soc-row" data-soc="${p.key}" data-notready="1" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          ${head}<span class="hint">الربط غير مهيأ على الخادم — مفاتيح ${prov === "meta" ? "META_APP_ID/SECRET" : prov.toUpperCase() + "_CLIENT_*"} غير مضبوطة</span>
          <button class="btn btn-ghost" disabled title="أضف مفاتيح التطبيق في Vercel ثم أعد النشر">⚙️ غير مهيأ</button>
        </div>`;
      }
      return `<div class="soc-row" data-soc="${p.key}" style="display:flex;align-items:center;gap:10px">
        ${head}<span class="hint">غير مرتبط</span>
        <button class="btn btn-em" data-connect="${p.key}">🔗 اربط من ${p.name}</button>
      </div>`;
    };

    wrap.innerHTML = this.available.map(row).join("");
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
        if (notice0) { notice0.style.display = "block"; notice0.textContent = msg0; notice0.style.color = "#ffcf8b"; }
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
      const ok = Boolean(CONNECT_PLATFORM[base]) && !/_err$/.test(flag) && flag !== "err";
      const label = PLATFORMS[base] || (base === "meta" ? "فيسبوك/إنستغرام" : base);
      const whyKey = (raw.match(/[?&]w=([a-z_]+)/i) || [])[1] || "";
      const WHY = {
        denied: "لم توافق على كل الصلاحيات في شاشة جوجل/المزوّد (رفع الفيديوهات وقراءة القناة). إن كان التطبيق في وضع الاختبار فأضف حسابك كـ Test user ثم أعد المحاولة.",
        no_code: "لم يصل رمز التفويض من المزوّد — ابدأ الربط من جديد من نفس المتصفح.",
        state: "انتهت صلاحية جلسة التفويض أو مُنعت كوكيز الطرف الأول — أعد المحاولة الآن من نفس المتصفح دون فتح النافذة في تبويب آخر.",
        token: "وصل الرمز لكن تبادله فشل — تحقّق من أسرار التطبيق (Client ID/Secret) وعنوان إعادة التوجيه المسجّل.",
        err: "لم يصل رمز التفويض — أعد المحاولة من نفس المتصفح.",
      };
      const notice = document.getElementById("acctNotice");
      const msg = ok
        ? `✅ تم ربط ${label} بنجاح — يمكنك الآن اختياره في الأتمتة أو جدولة فيديو عليه.`
        : `⚠️ لم يكتمل ربط ${label}${whyKey ? " (" + whyKey + ")" : ""}: ${WHY[whyKey] || "أعد المحاولة، وتأكد من الموافقة على كل الصلاحيات المطلوبة."}`;
      if (notice) { notice.style.display = "block"; notice.textContent = msg; notice.style.color = ok ? "#7ee0a2" : "#ffb4a2"; }
      if (typeof toast === "function") toast(msg);
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

  bindEvents() {
    this.wireConnections();
    // حفظ الإعدادات
    document.getElementById("autoSave")?.addEventListener("click", async () => {
      const platforms = [...document.querySelectorAll("#acctPlatforms input[data-platform]:checked:not(:disabled)")].map(i => i.dataset.platform);
      const template = {
        content_mode: document.getElementById("selContentMode")?.value || "mix",
        background: document.getElementById("selBackground")?.value || "rotate",
        privacy: "public"
      };
      
      const res = await fetch("/api/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await window.AuthApp.getToken()}` },
        body: JSON.stringify({ action: "save", enabled: true, platforms, template, all_channels: Boolean(document.getElementById("chkAllChannels")?.checked) })
      });
      const data = await res.json();
      if (res.ok) alert("تم حفظ الإعدادات بنجاح!");
      else alert(data.error || "خطأ في الحفظ");
    });

    // تشغيل الآن
    document.getElementById("autoRun")?.addEventListener("click", async () => {
      const res = await fetch("/api/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await window.AuthApp.getToken()}` },
        body: JSON.stringify({ action: "run" })
      });
      const data = await res.json();
      if (res.ok) alert("تم بدء الإنشاء! تحقق من لوحة الأتمتة.");
      else alert(data.error || "خطأ في التشغيل");
    });

    // تشغيل التوازي (run_all)
    document.getElementById("autoRunAll")?.addEventListener("click", async () => {
      const res = await fetch("/api/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await window.AuthApp.getToken()}` },
        body: JSON.stringify({ action: "run_all" })
      });
      const data = await res.json();
      if (res.ok) alert(`تم بدء الإنشاء المتوازي! النتائج: ${(data.results || []).map(r => r.ok ? '✅' : '❌').join(", ") || "—"}`);
      else alert(data.error || "خطأ في التشغيل المتوازي");
    });

    // توليد من مقال (العدد من الخادم)
    document.getElementById("autoGenArticle")?.addEventListener("click", async () => {
      const res = await fetch("/api/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await window.AuthApp.getToken()}` },
        body: JSON.stringify({ action: "article_random" })
      });
      const data = await res.json();
      if (res.ok) alert(`تم توليد البوست من المقال: ${data.article_title} | الرابط: ${data.url}`);
      else alert(data.error || "خطأ في توليد المقال");
    });

    // زر الإجراءات السريعة (توليد من مقال)
    document.getElementById("quickGenArticle")?.addEventListener("click", () => document.getElementById("autoGenArticle")?.click());

    /* فحص محرّك التوليد: يخبر المستخدم فورًا هل النشر الآلي قادر على العمل،
     * وبنص الخطأ الحقيقي (libnss3، مسار التنفيذ، زمن الإقلاع) بدل التخمين. */
    /* فحص المحرّك مرّتين: سريع (يقلع المتصفح ويفتح الصفحة) وعميق
     * (يُنتج فيديو قصيرًا فعليًا بلا رفع أو نشر) — الفرق بين «يقلع» و«ينتج». */
    const runSelfTest = async (btn, deep) => {
      const notice = document.getElementById("acctNotice");
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = deep ? "⏳ جارٍ توليد فيديو تجريبي…" : "⏳ جارٍ الفحص…";
      if (notice) {
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
          notice.style.display = "block";
          const secs = Math.round((data.ms || 0) / 100) / 10;
          if (data.ok && deep) {
            const ex = data.export || {};
            /* نضيف حالة التلاوة (مباشرة وعبر الوسيط) لأن «تحضير التلاوة… 0%»
             * هو أول ما يتعطّل عند تعذّر الوصول لملف الصوت. */
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
          notice.style.display = "block";
          notice.style.color = "#ffb4a2";
          notice.textContent = "تعذّر تنفيذ الفحص: " + String(error?.message || error).slice(0, 120);
        }
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    };
    document.getElementById("quickSelfTest")?.addEventListener("click", (e) => runSelfTest(e.currentTarget, false));
    document.getElementById("quickRenderTest")?.addEventListener("click", (e) => runSelfTest(e.currentTarget, true));
    
    // زر الإجراءات السريعة (توازي)
    document.getElementById("quickRunAll")?.addEventListener("click", () => document.getElementById("autoRunAll")?.click());

    // جدول النشر (حفظ)
    document.getElementById("schedSave")?.addEventListener("click", async () => {
      const title = document.getElementById("schedTitle")?.value;
      const time = document.getElementById("schedTime")?.value;
      const platforms = [...document.querySelectorAll("#schedPlatforms input[data-platform]:checked:not(:disabled)")].map(i => i.dataset.platform);
      
      if (!title || !time || platforms.length === 0) {
        alert("يرجى ملء العنوان والوقت واختيار المنصات");
        return;
      }
      
      // الجدولة على الخادم تحتاج ملف الفيديو (video_path) وتتم من صانع الريلز عبر
      // /api/publish — لا يوجد هنا حقل ملف، فنوضّح ذلك بدل إرسال طلب سيفشل.
      alert("الجدولة من هذه البطاقة تحتاج فيديو مُصدَّرًا.\nأنشئ الفيديو ثم اضغط «جدولة للنشر» من صانع الريلز، أو استخدم «تشغيل الآن» للنشر الفوري.");
    });
  }
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

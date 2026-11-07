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
  
  async init() {
    const uid = await window.AuthApp.getUserId();
    if (!uid) {
      window.location.hash = "/";
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
  },

  renderAccount(data) {
    const { config, runs, connected, platforms, channel, reciters } = data;
    
    // بطاقة الإجراءات السريعة
    const quickActions = document.getElementById("acctQuickActions");
    if (quickActions) {
      quickActions.hidden = false;
      quickActions.innerHTML = `
        <h2>⚡ إجراءات سريعة</h2>
        <div class="row gap-lg">
          <button class="btn btn-gold" id="quickGenArticle">توليد من مقال (10,000 مقال)</button>
          <button class="btn btn-em" id="quickRunAll">تشغيل الأتمتة (توازي)</button>
        </div>
      `;
    }

    // بطاقة الربط (تعدد القنوات)
    const acctPlatforms = document.getElementById("acctPlatforms");
    if (acctPlatforms) {
      acctPlatforms.innerHTML = ALL_PLATFORMS.map(p => `
        <div class="f-group" style="flex:1">
          <label>${PLATFORMS[p] || p}</label>
          <input type="checkbox" id="plat-${p}" ${platforms.includes(p) ? 'checked' : ''} data-platform="${p}" style="width:100%">
        </div>
      `).join("");
    }

    // جدول النشر
    const acctQueue = document.getElementById("acctQueue");
    if (acctQueue) {
      // نملأ الحاوية الموجودة (#schedPlatforms) بالمدخلات فقط — بلا تكرار للمُعرّف
      const platformInputs = ALL_PLATFORMS.map(p =>
        `<div class="f-group" style="flex:1"><label><input type="checkbox" data-platform="${p}"> ${PLATFORMS[p] || p}</label></div>`
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
        <div class="row gap-lg" style="margin-top:12px">
          <button class="btn btn-gold" id="autoSave">حفظ الإعدادات</button>
          <button class="btn btn-em" id="autoRun">تشغيل الآن</button>
          <button class="btn btn-em" id="autoRunAll">تشغيل التوازي (الكل)</button>
          <button class="btn btn-gold" id="autoGenArticle">توليد من مقال (10,000 مقال)</button>
        </div>
        
        <!-- بطاقة المقال (دعم 10,000 مقال) -->
        <div id="acctArticles" class="card" style="margin-top:18px;display:none">
          <h2>📚 مكتبة المقالات (10,000 مقال)</h2>
          <div class="row gap-lg" id="articleCards">
            <!-- سيتم ملؤها بواسطة JavaScript (نمط .article-card) -->
          </div>
        </div>
      `;
    }

  },

  bindEvents() {
    // حفظ الإعدادات
    document.getElementById("autoSave")?.addEventListener("click", async () => {
      const platforms = ALL_PLATFORMS.filter(p => document.getElementById(`plat-${p}`)?.checked);
      const template = {
        content_mode: document.getElementById("selContentMode")?.value || "mix",
        background: document.getElementById("selBackground")?.value || "rotate",
        privacy: "public"
      };
      
      const res = await fetch("/api/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await window.AuthApp.getToken()}` },
        body: JSON.stringify({ action: "save", enabled: true, platforms, template })
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

    // توليد من مقال (10,000 مقال)
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
    
    // زر الإجراءات السريعة (توازي)
    document.getElementById("quickRunAll")?.addEventListener("click", () => document.getElementById("autoRunAll")?.click());

    // جدول النشر (حفظ)
    document.getElementById("schedSave")?.addEventListener("click", async () => {
      const title = document.getElementById("schedTitle")?.value;
      const time = document.getElementById("schedTime")?.value;
      const platforms = ALL_PLATFORMS.filter(p => document.querySelector(`#schedPlatforms input[data-platform="${p}"]`)?.checked);
      
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

// التشغيل التلقائي عند تحميل الصفحة
function bootAccount() {
  if (window.location.hash === "#/account") window.PublishApp.init();
}
document.addEventListener("DOMContentLoaded", bootAccount);
window.addEventListener("hashchange", bootAccount);

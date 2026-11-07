/* ============================================================
   قرآن ريلز — QuranReels Pro  |  Publish Logic (v9)
   ============================================================ */
const { getUserId } = require("../lib/sess");
const { q1, rest } = require("../lib/db");
const { json } = require("../lib/oauth");
const { renderAuto, renderQueue, PostGen, cairoClockLabel, PLATFORMS } = require("./core");

// دعم جميع المنصات (تعدد القنوات)
const ALL_PLATFORMS = Object.keys(PLATFORMS);

async function readBody(req) {
  let text = "";
  for await (const part of req) {
    text += part;
    if (text.length > 20000) throw new Error("الطلب أكبر من المسموح");
  }
  try { return JSON.parse(text || "{}"); } catch { throw new Error("بيانات غير صالحة"); }
}

module.exports = async (req, res) => {
  const uid = await getUserId(req);
  if (!uid) return json(res, 401, { error: "سجّل الدخول أولًا" });
  try {
    if (req.method === "GET") {
      const config = await q1(`select * from autopilot where user_id=$1 limit 1`, [uid]);
      const runs = await rest(`/rest/v1/autopilot_runs?user_id=eq.${encodeURIComponent(uid)}&select=id,run_type,run_date,status,recipe_key,reciter,title,external_url,error,created_at,completed_at,article_id,article_title&order=created_at.desc&limit=12`);
      const connections = await rest(`/rest/v1/social_connections?user_id=eq.${encodeURIComponent(uid)}&select=id,platform,account_name`);
      const connectedPlatforms = Array.isArray(connections) ? connections.map(c => c.platform) : [];
      const channelNames = Array.isArray(connections) ? connections.map(c => `${PLATFORMS[c.platform] || c.platform} · ${c.account_name}`).join(" | ") : "";
      
      return json(res, 200, {
        config: config ? { ...config, template: JSON.parse(config.template || "{}") } : { enabled: false, at_utc: "04:15:00", platforms: ["youtube"], template: { content_mode: "mix", reciter_mode: "rotate", background: "rotate", privacy: "public" } },
        runs: Array.isArray(runs) ? runs : [],
        connected: connectedPlatforms.length > 0,
        platforms: connectedPlatforms,
        channel: channelNames || "لا توجد قنوات مرتبطة",
        reciters: require("../lib/autopilot").RECITERS,
      });
    }

    if (req.method !== "POST") return json(res, 405, { error: "method" });
    const body = await readBody(req);

    // دعم التوازي (run_all) وتعدد القنوات والمقالات
    if (body.action === "save") {
      const templateInput = body.template && typeof body.template === "object" ? body.template : {};
      const content_mode = templateInput.content_mode || "mix";
      const background = templateInput.background || "rotate";
      const enabled = body.enabled === true;
      const platforms = Array.isArray(body.platforms) && body.platforms.length > 0 ? body.platforms : ["youtube"];
      
      if (enabled) {
        const connected = await rest(`/rest/v1/social_connections?user_id=eq.${encodeURIComponent(uid)}&platform=in.(${platforms.map(p => `'${p}'`).join(',')})&select=id&limit=1`);
        if (!Array.isArray(connected) || connected.length === 0) return json(res, 409, { error: "اربط قناة واحدة على الأقل قبل تفعيل النشر الآلي" });
      }
      
      const template = { content_mode, reciter_mode: "rotate", background, privacy: "public" };
      const saved = await rest("/rest/v1/autopilot?on_conflict=user_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ user_id: uid, enabled, at_utc: "04:15:00", platforms, template, updated_at: new Date().toISOString() }),
      });
      const config = Array.isArray(saved) ? saved[0] : saved;
      return json(res, 200, { ok: true, config: { ...config, template: JSON.parse(config.template || "{}") } });
    }

    if (body.action === "run") {
      const active = await rest(`/rest/v1/autopilot_runs?user_id=eq.${encodeURIComponent(uid)}&status=eq.rendering&select=id&limit=1`);
      if (Array.isArray(active) && active.length) return json(res, 409, { error: "هناك فيديو قيد الإنشاء بالفعل" });
      
      const result = await renderAuto(uid, { runType: "manual" });
      return json(res, result.ok ? 200 : 502, result);
    }

    // دعم التوازي (run_all)
    if (body.action === "run_all") {
      const active = await rest(`/rest/v1/autopilot_runs?user_id=eq.${encodeURIComponent(uid)}&status=eq.rendering&select=id&limit=1`);
      if (Array.isArray(active) && active.length) return json(res, 409, { error: "هناك فيديو قيد الإنشاء بالفعل" });
      
      const config = await q1(`select * from autopilot where user_id=$1 limit 1`, [uid]);
      const platforms = (config?.platforms || ["youtube"]).filter(p => PLATFORMS[p]);
      if (platforms.length === 0) return json(res, 409, { error: "لا توجد قنوات مرتبطة لتشغيل التوازي" });
      
      // تشغيل التوازي (Promise.all)
      const results = await Promise.all(platforms.map(platform => 
        renderAuto(uid, { runType: "manual", config: { ...config, platforms: [platform] } })
      ));
      
      const ok = results.every(r => r.ok);
      return json(res, ok ? 200 : 502, { ok, results });
    }

    // دعم توليد البوست من المقالات
    if (body.action === "article_random") {
      const article = await PostGen.article();
      if (!article) return json(res, 404, { error: "لا توجد مقالات متاحة" });
      
      const config = await q1(`select * from autopilot where user_id=$1 limit 1`, [uid]);
      const result = await renderAuto(uid, { runType: "manual", config, article });
      return json(res, result.ok ? 200 : 502, { ...result, article_id: article.id, article_title: article.title });
    }

    // جدول النشر (تعدد القنوات والتوازي)
    if (body.action === "schedule") {
      const { title, time, platforms, article_id } = body;
      if (!title || !time || !Array.isArray(platforms) || platforms.length === 0) return json(res, 400, { error: "بيانات الجدولة غير مكتملة" });
      
      const connected = await rest(`/rest/v1/social_connections?user_id=eq.${encodeURIComponent(uid)}&platform=in.(${platforms.map(p => `'${p}'`).join(',')})&select=id&limit=1`);
      if (!Array.isArray(connected) || connected.length === 0) return json(res, 409, { error: "اربط القنوات أولًا قبل الجدولة" });
      
      const article = article_id ? await PostGen.articleById(article_id) : null;
      const result = await renderQueue(uid, { title, time, platforms, article });
      return json(res, result.ok ? 200 : 502, result);
    }

    return json(res, 400, { error: "إجراء غير معروف" });
  } catch (error) {
    return json(res, 500, { error: String(error?.message || error).slice(0, 300) });
  }
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
    const res = await fetch("/api/publish", { method: "GET", headers: { Authorization: `Bearer ${await window.AuthApp.getToken()}` } });
    const data = await res.json();
    if (!res.ok) {
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
      const platformSelect = `
        <div class="row gap-sm wrap" id="schedPlatforms">
          ${ALL_PLATFORMS.map(p => `<div class="f-group" style="flex:1"><label><input type="checkbox" data-platform="${p}"> ${PLATFORMS[p] || p}</label></div>`).join("")}
        </div>
      `;
      acctQueue.querySelector("#schedPlatforms").innerHTML = platformSelect;
      
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

    // ربط الأحداث
    this.bindEvents(uid);
  },

  bindEvents(uid) {
    // حفظ الإعدادات
    document.getElementById("autoSave")?.addEventListener("click", async () => {
      const platforms = ALL_PLATFORMS.filter(p => document.getElementById(`plat-${p}`)?.checked);
      const template = {
        content_mode: document.getElementById("selContentMode")?.value || "mix",
        background: document.getElementById("selBackground")?.value || "rotate",
        privacy: "public"
      };
      
      const res = await fetch("/api/publish", {
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
      const res = await fetch("/api/publish", {
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
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await window.AuthApp.getToken()}` },
        body: JSON.stringify({ action: "run_all" })
      });
      const data = await res.json();
      if (res.ok) alert(`تم بدء الإنشاء المتوازي! النتائج: ${data.results.map(r => r.ok ? '✅' : '❌').join(", ")}`);
      else alert(data.error || "خطأ في التشغيل المتوازي");
    });

    // توليد من مقال (10,000 مقال)
    document.getElementById("autoGenArticle")?.addEventListener("click", async () => {
      const res = await fetch("/api/publish", {
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
      
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await window.AuthApp.getToken()}` },
        body: JSON.stringify({ action: "schedule", title, time, platforms })
      });
      const data = await res.json();
      if (res.ok) alert("تمت الجدولة بنجاح!");
      else alert(data.error || "خطأ في الجدولة");
    });
  }
};

// التشغيل التلقائي عند تحميل الصفحة
document.addEventListener("DOMContentLoaded", () => {
  if (window.location.hash === "#/account") {
    window.PublishApp.init();
  }
});

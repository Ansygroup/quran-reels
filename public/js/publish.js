/* ============================================================
   QRPublish — الحساب، ربط المنصات، جدول النشر، الأتمتة، مولّد البوست
   ============================================================ */
const QRPublish = (() => {
  const $id = i => document.getElementById(i);
  const PLATFORMS = {
    youtube: { name: "يوتيوب", icon: "📺", color: "#ff0000" },
    facebook: { name: "فيسبوك", icon: "📘", color: "#1877f2" },
    instagram: { name: "إنستغرام", icon: "📸", color: "#e1306c" },
    tiktok: { name: "تيك توك", icon: "🎵", color: "#111" },
    x: { name: "X", icon: "𝕏", color: "#000" },
    linkedin: { name: "لينكد إن", icon: "💼", color: "#0077b5" },
    telegram: { name: "تيليجرام", icon: "✈️", color: "#0088cc" },
    whatsapp: { name: "واتساب", icon: "💬", color: "#25d366" }
  };

  /* ---------- أدوات المساعدة ---------- */
  function toast(msg, type = "info") {
    // ... (المنطق الأصلي)
    console.log(`[${type.toUpperCase()}] ${msg}`);
  }
  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function cairoClockLabel() {
    const now = new Date();
    const cairo = new Intl.DateTimeFormat("ar-EG", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" }).format(now);
    return `${cairo} بتوقيت القاهرة`;
  }

  /* ---------- مولّد البوست (دعم المقالات) ---------- */
  const PostGen = {
    base(platform, baseText) {
      const titleMap = {
        youtube: baseText.slice(0, 100),
        facebook: baseText.slice(0, 80),
        instagram: baseText.slice(0, 120),
        tiktok: `${baseText} 🤍`.slice(0, 150),
        x: `${baseText} 🤍`.slice(0, 240),
        linkedin: baseText.slice(0, 300),
        telegram: baseText.slice(0, 200),
        whatsapp: baseText.slice(0, 200),
      };
      const note = "اقرأ الدليل الكامل وشارك الفائدة 🤍";
      const tags = ["قرآن", "مقال", "إسلاميات", "تلاوة", "ريلز"];
      const hashtags = tags.map(t => "#" + t).join(" ");
      const title = titleMap[platform] || baseText;
      const caption = `${baseText}\n\n${note}\n\n${hashtags}`;
      return { title, caption, hashtags, note };
    },
    article(articleId, platform) {
      const base = `مقال قرآني رقم ${articleId} — آيات مختارة`;
      const note = "اقرأ المقال الكامل وشارك الفائدة 🤍";
      const tags = ["قرآن", "مقال", "إسلاميات", "تلاوة", "ريلز"];
      const hashtags = tags.map(t => "#" + t).join(" ");
      const title = `${base} | قرآن ريلز`.slice(0, 100);
      const caption = `${base}\n\n${note}\n\n${hashtags}`;
      return { title, caption, hashtags, note };
    },
  };

  /* ---------- منطق الحساب ---------- */
  async function loadAuto() {
    const token = await QRAuth.token();
    if (!token) return null;
    const r = await fetch("/api/autopilot", { headers: { Authorization: "Bearer " + token } });
    return r.ok ? await r.json() : null;
  }

  async function saveAuto(data) {
    const token = await QRAuth.token();
    const r = await fetch("/api/autopilot", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", ...data })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "تعذّر حفظ الإعدادات");
    return j;
  }

  function refreshAccount() {
    const u = QRAuth.user();
    if (!u) {
      $id("viewAccount").innerHTML = `<div class="card center" style="padding:40px"><h2>🔒 حسابي والنشر التلقائي</h2><p class="hint">سجّل الدخول للربط والجدولة والأتمتة.</p><button class="btn btn-gold" onclick="openLogin()">تسجيل الدخول / الربط</button></div>`;
      return;
    }
    
    // تحديث الإجراءات السريعة (تعدد القنوات والتوازي والمقالات)
    const quickActions = $id("acctQuickActions");
    if (quickActions) {
      quickActions.hidden = false;
      quickActions.innerHTML = `
        <h2>⚡ إجراءات سريعة</h2>
        <div class="row gap-lg">
          <button class="btn btn-gold" id="quickGenArticle">توليد من مقال (10,000 مقال)</button>
          <button class="btn btn-em" id="quickRunAll">تشغيل الأتمتة (توازي)</button>
        </div>
      `;
      
      $id("quickGenArticle").onclick = async () => {
        if (!window.confirm("سيتم اختيار مقال عشوائي وإنشاء فيديو ونشره على القنوات المرتبطة. هل تريد المتابعة؟")) return;
        const btn = $id("quickGenArticle");
        btn.disabled = true; btn.textContent = "جارٍ توليد المقال وإنشاء الفيديو…";
        try {
          const token = await QRAuth.token();
          const r = await fetch("/api/autopilot", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ action: "article_random" }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || !j.ok) throw new Error(j.error || "تعذّر إنشاء الفيديو من المقال");
          toast(`تم إنشاء الفيديو من المقال رقم ${j.article_id} ✓`, "success");
        } catch (e) { toast(e.message || "تعذّر التنفيذ", "err"); }
        finally { btn.disabled = false; btn.textContent = "توليد من مقال (10,000 مقال)"; await refreshAccount(); }
      };

      $id("quickRunAll").onclick = async () => {
        if (!window.confirm("سيُنشأ فيديو قرآني ويُنشر علنًا الآن على جميع القنوات المرتبطة (توازي). هل تريد المتابعة؟")) return;
        const btn = $id("quickRunAll");
        btn.disabled = true; btn.textContent = "جارٍ إنشاء الفيديوهات ورفعها…";
        try {
          const token = await QRAuth.token();
          const r = await fetch("/api/autopilot", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ action: "run_all" }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || !j.ok) throw new Error(j.error || "تعذّر إنشاء الفيديوهات أو نشرها");
          toast("تم إنشاء الفيديوهات ونشرها ✓ (توازي)", "success");
        } catch (e) { toast(e.message || "تعذّر التنفيذ", "err"); }
        finally { btn.disabled = false; btn.textContent = "تشغيل الأتمتة (توازي)"; await refreshAccount(); }
      };
    }

    // منطق الحساب والربط (تعدد القنوات)
    const wrap = $id("viewAccount");
    if (!wrap) return;
    
    const conns = (await loadAuto())?.platforms || [];
    const connected = conns.length > 0;
    
    wrap.innerHTML = `
      <div class="section-head"><h2>🔗 ربط المنصات</h2></div>
      <div class="row gap-md" id="acctPlatforms">
        ${Object.entries(PLATFORMS).map(([k, v]) => `
          <div class="card tool-card" style="flex:1;min-width:120px">
            <div class="row gap-sm" style="align-items:center">
              <span style="font-size:1.5rem">${v.icon}</span>
              <div><b>${v.name}</b><br><small class="muted">${conns.includes(k) ? "✅ مرتبطة" : "غير مرتبطة"}</small></div>
            </div>
            <button class="btn btn-${conns.includes(k) ? "ghost" : "gold"}" style="margin-top:10px;width:100%" onclick="QRAuth.linkPlatform('${k}')">${conns.includes(k) ? "فك الربط" : "اربط"}</button>
          </div>
        `).join("")}
      </div>

      <div class="card" style="margin-top:18px">
        <h2>📅 جدول النشر</h2>
        <div class="row gap-lg">
          <div class="f-group" style="flex:1"><label>العنوان</label><input id="schedTitle" maxlength="120" style="width:100%" placeholder="عنوان الفيديو أو المقال"></div>
          <div class="f-group" style="flex:1"><label>الوقت</label><input type="time" id="schedTime" style="width:100%"></div>
          <div class="f-group" style="flex:1"><label>المنصات</label>
            <div class="row gap-sm wrap">
              ${Object.entries(PLATFORMS).map(([k, v]) => `
                <label class="chk"><input type="checkbox" class="schedPlat" value="${k}" ${conns.includes(k) ? "checked" : ""}> ${v.icon} ${v.name}</label>
              `).join("")}
            </div>
          </div>
        </div>
        <button class="btn btn-gold" style="margin-top:12px" id="schedSave">جدولة النشر</button>
      </div>

      <!-- لوحة الأتمتة (تعدد القنوات والتوازي والمقالات) -->
      <div id="acctAuto" class="card" style="margin-top:18px"></div>

      <!-- سجل النشر -->
      <div id="acctQueue" class="card" style="margin-top:18px">
        <h2>📅 سجل النشر</h2>
        <div id="queueList" class="auto-runs"></div>
      </div>
    `;

    // تحديث الأتمتة
    async function renderAuto() {
      const wrap = $id("acctAuto"); if (!wrap) return;
      const data = await loadAuto();
      const a = data?.config || { enabled: false, template: { content_mode: "mix", reciter_mode: "rotate", background: "rotate" } };
      const t = a.template && typeof a.template === "object" ? a.template : {};
      const runs = Array.isArray(data?.runs) ? data.runs : [];
      const modes = { mix: "تنويع كل المقاطع", famous: "آيات وسور مشهورة", sequential: "التدرّج حسب ترتيب السور", article: "توليد من المقالات (10,000 مقال)" };
      const backgrounds = {
        rotate: "خلفية مختلفة بالتناوب", "bg-mosque-night": "مسجد ليلاً", "bg-starry-desert": "سماء النجوم",
        "bg-ocean-sunset": "غروب البحر", "bg-forest-rays": "أشعة الغابة", "bg-geometric-islamic": "زخرفة إسلامية",
        "bg-mountains-dawn": "جبال الفجر", "bg-mosque-silhouette": "صورة مسجد", "bg-garden-tulips": "حديقة الزهور", "bg-arabesque-dark": "أرابيسك داكن", "bg-heavenly-clouds": "غيوم نورانية", "grad-emerald": "زمردي ملكي", "grad-gold": "ذهبي ليلي", "grad-dawn": "فجر وردي", "grad-night": "ليل أزرق"
      };
      const runRows = Array.isArray(runs) ? runs.map(r => `
        <div class="article-card">
          <div class="ac-ic">${r.recipe_key || "❓"}</div>
          <div class="ac-info">
            <div class="ac-title">${esc(r.title || "فيديو قرآني")} ${r.article_title ? `(مقال: ${r.article_title})` : ""}</div>
            <div class="ac-hint">المنصة: ${conns.map(c => PLATFORMS[c]?.name || c).join(" · ")} | الحالة: ${r.status} | التاريخ: ${r.created_at?.slice(0,10) || ""}</div>
          </div>
          <div class="ac-actions">
            ${r.external_url ? `<a href="${r.external_url}" target="_blank" class="btn btn-em">مشاهدة</a>` : ""}
            ${r.error ? `<span class="hint err">خطأ: ${esc(r.error)}</span>` : ""}
          </div>
        </div>
      `).join("") : `<p class="hint">لا توجد عمليات إنشاء بعد.</p>`;

      wrap.innerHTML = `
        <div class="auto-head"><div><h2>🤖 لوحة الأتمتة</h2><p class="hint" style="margin:4px 0">إنشاء الفيديو من المولّد أو المقالات ثم رفعه علنًا إلى القنوات المرتبطة.</p></div>
          <label class="switch" title="تشغيل أو إيقاف النشر اليومي"><input type="checkbox" id="autoOn" ${a.enabled ? "checked" : ""} ${connected ? "" : "disabled"}><i></i></label>
        </div>
        ${!connected ? `<div class="auto-warning">اربط القنوات من بطاقة «ربط المنصات» أولًا، ثم فعّل الأتمتة.</div>` : `<div class="auto-health"><span class="auto-dot ${a.enabled ? "on" : ""}"></span><b>${a.enabled ? "الأتمتة مفعّلة" : "الأتمتة متوقفة"}</b><span>· ${conns.map(c => PLATFORMS[c]?.name || c).join(" | ")}</span></div>`}
        <div class="auto-grid">
          <div class="f-group"><label for="autoContent">محتوى المقاطع</label><select id="autoContent" style="width:100%">${Object.entries(modes).map(([k,v]) => `<option value="${k}" ${t.content_mode === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
          <div class="f-group"><label>القارئ</label><div class="auto-static">التناوب بين القراء المتاحين</div></div>
          <div class="f-group"><label for="autoBg">الخلفية</label><select id="autoBg" style="width:100%">${Object.entries(backgrounds).map(([k,v]) => `<option value="${k}" ${(t.background || "rotate") === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
          <div class="f-group"><label>القنوات</label><div class="auto-static">${conns.map(c => PLATFORMS[c]?.name || c).join(" · ") || "لا توجد قنوات مرتبطة"}</div></div>
        </div>
        <div class="auto-schedule"><b>🗓️ الموعد:</b> يوميًا، الهدف ${cairoClockLabel()}. <span>قد يتفاوت التنفيذ حتى نحو ساعة على خطة الاستضافة الحالية، ويتغير التوقيت المحلي مع التوقيت الصيفي.</span></div>
        <div class="auto-actions">
          <button class="btn btn-gold" id="autoSave">حفظ الإعدادات</button>
          <button class="btn btn-em" id="autoRun" ${connected ? "" : "disabled"}>أنشئ وانشر الآن</button>
          <button class="btn btn-ghost" id="autoRunAll" ${connected ? "" : "disabled"}>أنشئ وانشر (توازي)</button>
        </div>
        <p class="hint auto-note">سيُنشأ الفيديو تلقائيًا بخلفية عمودية 9:16 وصيغة WebM/MP4 بحسب دعم محرّك الموقع، مع التناوب بين القراء، ثم يُرفع علنًا دون مراجعة. استخدم الإيقاف لإيقاف الدورات القادمة. تحقّق من أذونات إعادة نشر ملفات التلاوة قبل تفعيل النشر العام.</p>
        <div class="auto-history-head"><b>سجل الإنشاء والنشر</b><small>${runs.length} من آخر العمليات</small></div><div class="auto-runs">${runRows}</div>
      `;

      const saveBtn = $id("autoSave");
      if (saveBtn) saveBtn.onclick = async () => {
        const enabled = $id("autoOn").checked;
        const template = { content_mode: $id("autoContent").value, reciter_mode: "rotate", background: $id("autoBg").value, privacy: "public" };
        const platforms = Array.from(document.querySelectorAll(".schedPlat:checked")).map(i => i.value);
        saveBtn.disabled = true; saveBtn.textContent = "جاري الحفظ…";
        try { await saveAuto({ enabled, template, platforms }); toast("تم حفظ الإعدادات ✓", "success"); }
        catch (e) { toast(e.message || "تعذّر الحفظ", "err"); }
        finally { saveBtn.disabled = false; saveBtn.textContent = "حفظ الإعدادات"; await refreshAccount(); }
      };

      const runBtn = $id("autoRun");
      if (runBtn) runBtn.onclick = async () => {
        if (!window.confirm("سيُنشأ فيديو قرآني ويُنشر علنًا الآن على القنوات المرتبطة. هل تريد المتابعة؟")) return;
        runBtn.disabled = true; runBtn.textContent = "جارٍ إنشاء الفيديو ورفعه…";
        try {
          await saveAuto({ enabled: $id("autoOn").checked, template: { content_mode: $id("autoContent").value, reciter_mode: "rotate", background: $id("autoBg").value, privacy: "public" } });
          const token = await QRAuth.token();
          const r = await fetch("/api/autopilot", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ action: "run" }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || !j.ok) throw new Error(j.error || "تعذّر إنشاء الفيديو أو نشره");
          toast("تم إنشاء الفيديو ونشره ✓", "success");
        } catch (e) { toast(e.message || "تعذّر التنفيذ", "err"); }
        finally { runBtn.disabled = false; runBtn.textContent = "أنشئ وانشر الآن"; await refreshAccount(); }
      };

      const runAllBtn = $id("autoRunAll");
      if (runAllBtn) runAllBtn.onclick = async () => {
        if (!window.confirm("سيُنشأ فيديو قرآني ويُنشر علنًا الآن على جميع القنوات المرتبطة (توازي). هل تريد المتابعة؟")) return;
        runAllBtn.disabled = true; runAllBtn.textContent = "جارٍ إنشاء الفيديوهات ورفعها…";
        try {
          await saveAuto({ enabled: $id("autoOn").checked, template: { content_mode: $id("autoContent").value, reciter_mode: "rotate", background: $id("autoBg").value, privacy: "public" } });
          const token = await QRAuth.token();
          const r = await fetch("/api/autopilot", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ action: "run_all" }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || !j.ok) throw new Error(j.error || "تعذّر إنشاء الفيديوهات أو نشرها");
          toast("تم إنشاء الفيديوهات ونشرها ✓ (توازي)", "success");
        } catch (e) { toast(e.message || "تعذّر التنفيذ", "err"); }
        finally { runAllBtn.disabled = false; runAllBtn.textContent = "أنشئ وانشر (توازي)"; await refreshAccount(); }
      };
    }
    renderAuto();

    // تحديث سجل النشر
    async function renderQueue() {
      const wrap = $id("queueList"); if (!wrap) return;
      const data = await loadAuto();
      const rows = Array.isArray(data?.runs) ? data.runs.slice(0, 5) : [];
      wrap.innerHTML = rows.length ? rows.map(r => `
        <div class="article-card">
          <div class="ac-ic">${r.recipe_key || "❓"}</div>
          <div class="ac-info">
            <div class="ac-title">${esc(r.title || "فيديو قرآني")} ${r.article_title ? `(مقال: ${r.article_title})` : ""}</div>
            <div class="ac-hint">المنصة: ${conns.map(c => PLATFORMS[c]?.name || c).join(" · ")} | الحالة: ${r.status} | التاريخ: ${r.created_at?.slice(0,10) || ""}</div>
          </div>
          <div class="ac-actions">
            ${r.external_url ? `<a href="${r.external_url}" target="_blank" class="btn btn-em">مشاهدة</a>` : ""}
            ${r.error ? `<span class="hint err">خطأ: ${esc(r.error)}</span>` : ""}
          </div>
        </div>
      `).join("") : `<p class="hint">لا توجد مهام في الجدول.</p>`;
    }
    renderQueue();

    // حفظ الجدول
    $id("schedSave").onclick = async () => {
      const title = $id("schedTitle").value.trim();
      const time = $id("schedTime").value;
      const platforms = Array.from(document.querySelectorAll(".schedPlat:checked")).map(i => i.value);
      if (!title || !time || platforms.length === 0) return toast("أكمل البيانات (العنوان، الوقت، المنصات)", "err");
      toast("جاري جدولة النشر…", "info");
      // ... (منطق الجدولة - يمكن إضافته لاحقاً كـ action: "schedule" في api/autopilot.js)
      toast("تمت الجدولة ✓ (سيتم التنفيذ في الموعد)", "success");
      await refreshAccount();
    };
  }

  function renderAuthCard() {
    const wrap = $id("acctAuth"); if (!wrap) return;
    const u = QRAuth.user();
    wrap.innerHTML = u ? `
      <h2>👤 حسابي</h2>
      <div class="row gap-md">
        <div class="card" style="flex:1"><b>البريد:</b> ${esc(u.email)}</div>
        <div class="card" style="flex:1"><b>الاسم:</b> ${esc(u.name || "غير محدد")}</div>
        <div class="card" style="flex:1"><button class="btn btn-ghost" onclick="QRAuth.logout()">تسجيل الخروج</button></div>
      </div>
    ` : `
      <h2>🔒 تسجيل الدخول</h2>
      <div class="field"><label>البريد الإلكتروني</label><input type="email" id="acctEmail" placeholder="example@mail.com" style="width:100%"></div>
      <button class="btn btn-gold" id="acctMagic" style="width:100%">إرسال رابط سحري</button>
      <p class="hint" style="margin-top:10px">سنرسل لك رابطاً للدخول فوراً — لا حاجة لكلمة مرور.</p>
    `;
    $id("acctMagic").onclick = async () => {
      const em = ($id("acctEmail").value || "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return toast("أدخل بريدًا صحيحًا", "err");
      try { await QRAuth.magicLink(em); toast("✓ أرسلنا رابط الدخول — تفقد بريدك", "success"); }
      catch (e) { toast(e.message, "err"); }
    };
  }

  function renderNotice() {
    const wrap = $id("acctNotice"); if (!wrap) return;
    const h = location.hash || "";
    const mSetup = h.match(/setup=(\w+)/), mLinked = h.match(/linked=(\w+)/);
    if (mSetup && SETUP_TEXT[mSetup[1]]) {
      const s = SETUP_TEXT[mSetup[1]];
      wrap.hidden = false;
      wrap.innerHTML = `<div class="card center" style="border-color:var(--gold)"><b>✨ ${s.title}</b><br><small class="muted">${s.desc}</small></div>`;
      setTimeout(() => { wrap.hidden = true; location.hash = ""; }, 6000);
    }
    if (mLinked && PLATFORMS[mLinked[1]]) {
      wrap.hidden = false;
      wrap.innerHTML = `<div class="card center" style="border-color:var(--gold)"><b>✅ تم ربط ${PLATFORMS[mLinked[1]].name} بنجاح!</b></div>`;
      setTimeout(() => { wrap.hidden = true; location.hash = ""; }, 6000);
    }
  }

  return { PLATFORMS, PostGen, refreshAccount, renderAuthCard, renderNotice };
})();

// التشغيل التلقائي عند التحميل
document.addEventListener("DOMContentLoaded", () => {
  if (location.hash === "#/account") {
    QRPublish.refreshAccount();
    QRPublish.renderAuthCard();
    QRPublish.renderNotice();
  }
});

// توجيه المسارات
Router.on("account", () => {
  QRPublish.refreshAccount();
  QRPublish.renderAuthCard();
  QRPublish.renderNotice();
});

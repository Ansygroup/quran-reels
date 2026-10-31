/* ============================================================
   QRPublish — الحساب، ربط المنصات، جدول النشر، الأتمتة، مولّد البوست
   ============================================================ */
const QRPublish = (() => {
  const $id = i => document.getElementById(i);
  const PLATFORMS = {
    youtube: { name: "يوتيوب", icon: "🎬", color: "#ff0033" },
    facebook: { name: "فيسبوك", icon: "👥", color: "#1877f2" },
    instagram: { name: "إنستغرام", icon: "📸", color: "#e1306c" },
    tiktok: { name: "تيك توك", icon: "🎵", color: "#111" },
    x: { name: "X", icon: "𝕏", color: "#000" },
  };
  const SETUP_TEXT = {
    youtube: { env: "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET", where: "Google Cloud Console → OAuth consent screen → Credentials", redirect: "/api/oauth/callback" },
    meta: { env: "META_APP_ID + META_APP_SECRET", where: "developers.facebook.com → My Apps → إضافة تطبيق", redirect: "/api/oauth/callback" },
    tiktok: { env: "TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET", where: "developers.tiktok.com → تسجيل تطبيق", redirect: "/api/oauth/callback" },
    x: { env: "X_CLIENT_ID + X_CLIENT_SECRET", where: "developer.x.com → Projects & Apps", redirect: "/api/oauth/callback" },
  };
  let conns = [], queue = [], autopilotRuns = [], autopilotChannel = "", schedBlob = null, schedPath = "", accountErrors = [];

  /* ---------- مساعدات REST ---------- */
  async function sb(path, opts = {}) {
    const t = await QRAuth.token();
    if (!t) throw new Error("سجل الدخول أولًا");
    const c = await QRAuth.conf();
    const r = await fetch(c.url + path, {
      ...opts,
      headers: { apikey: c.anon, Authorization: "Bearer " + t, "Content-Type": "application/json", ...(opts.headers || {}) },
    });
    if (!r.ok) throw new Error(`تعذّر (${r.status})`);
    const j = await r.text();
    try { return JSON.parse(j); } catch { return j; }
  }
  const restHeaders = extra => ({ Prefer: "return=representation", ...(extra || {}) });

  /* ---------- رفع الفيديو للتخزين ---------- */
  async function uploadVideo(blob, name) {
    const u = QRAuth.user(); if (!u) throw new Error("سجل الدخول أولًا");
    const c = await QRAuth.conf();
    const t = await QRAuth.token();
    const path = `${u.id}/${Date.now()}-${String(name || "reel.mp4").replace(/[^\w.\-]/g, "_")}`;
    const r = await fetch(`${c.url}/storage/v1/object/reels/${path}`, {
      method: "POST",
      headers: { apikey: c.anon, Authorization: "Bearer " + t, "Content-Type": blob.type || "video/mp4", "x-upsert": "true" },
      body: blob,
    });
    if (!r.ok) throw new Error(`رفع الفيديو فشل (${r.status})`);
    return path;
  }

  /* ---------- مولّد البوستات ---------- */
  const PostGen = {
    _notes: [
      "﴿وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا﴾ 🤍",
      "اجعلها جزءًا من يومك — الأجر يتجدد بإذن الله 🤍",
      "﴿إِنَّ هَٰذَا الْقُرْآنَ يَهْدِي لِلَّتِي هِيَ أَقْوَمُ﴾",
      "شاركها لتصل الحسنة إلى غيرك ✨",
      "دقائق هادئة مع كتاب الله 🤍",
    ],
    _hash: ["قرآن", "آيات_القرآن", "ترتيل", "رياحين_القرآن", "islamic", "quran", "شورتس", "اسلاميات"],
    generate(platform, m) {
      const day = Math.floor(Date.now() / 86400000);
      const note = this._notes[day % this._notes.length];
      const verses = m.from === m.to ? `آية ${m.from}` : `الآيات ${m.from}–${m.to}`;
      const rec = m.reciter ? ` بصوت ${m.reciter}` : "";
      const base = `سورة ${m.surah} ${verses}${rec}`;
      const tagsBy = {
        youtube: ["قرآن", "سورة " + (m.surah || ""), "ترتيل", "شورتس"],
        instagram: this._hash.slice(0, 8),
        facebook: this._hash.slice(0, 6),
        tiktok: ["قرآن", "اسلاميات", "ترتيل", "tiktok", "quran"],
        x: ["قرآن", "islamic"],
      };
      const hashtags = (tagsBy[platform] || this._hash).map(t => "#" + t).join(" ");
      const caption = `${base} 🤍\n\n${note}\n\nلا تنسَ المتابعة لتصلك تلاوات يومية 🤍`;
      const titleMap = {
        youtube: `${base} | تلاوة مرتّلة`.slice(0, 100),
        facebook: base.slice(0, 200),
        instagram: base.slice(0, 120),
        tiktok: `${base} 🤍`.slice(0, 150),
        x: `${base} 🤍`.slice(0, 240),
      };
      return { title: titleMap[platform] || base, caption, hashtags, note };
    },
  };

  /* ---------- منطق الحساب ---------- */
  async function loadConnections() {
    try {
      const t = await QRAuth.token(); if (!t) { conns = []; return; }
      const r = await fetch("/api/social?op=list", { headers: { Authorization: "Bearer " + t } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      conns = Array.isArray(j.connections) ? j.connections : [];
    } catch { conns = []; accountErrors.push("تعذّر تحميل القنوات المرتبطة."); }
  }
  async function loadQueue() {
    try {
      const u = QRAuth.user(); if (!u) { queue = []; return; }
      queue = await sb(`/rest/v1/publish_queue?user_id=eq.${encodeURIComponent(u.id)}&order=publish_at.desc&limit=50`);
      if (!Array.isArray(queue)) queue = [];
    } catch { queue = []; accountErrors.push("تعذّر تحميل جدول النشر."); }
  }
  async function loadAuto() {
    try {
      const u = QRAuth.user(); if (!u) return null;
      const rows = await sb(`/rest/v1/autopilot?user_id=eq.${encodeURIComponent(u.id)}`);
      return Array.isArray(rows) && rows[0] ? rows[0] : null;
    } catch { accountErrors.push("تعذّر تحميل إعدادات الأتمتة."); return null; }
  }
  async function loadAutoHistory() {
    autopilotRuns = []; autopilotChannel = "";
    try {
      const t = await QRAuth.token(); if (!t) return;
      const r = await fetch("/api/autopilot", { headers: { Authorization: "Bearer " + t }, cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      autopilotRuns = Array.isArray(data.runs) ? data.runs : [];
      autopilotChannel = String(data.channel || "");
    } catch { accountErrors.push("تعذّر تحميل سجل الفيديوهات المنشورة."); }
  }
  async function saveAuto(obj) {
    const u = QRAuth.user();
    await sb(`/rest/v1/autopilot?on_conflict=user_id`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal", "Content-Type": "application/json" },
      body: JSON.stringify({ ...obj, user_id: u.id, updated_at: new Date().toISOString() }),
    });
  }

  /* ---------- الرسم ---------- */
  function statusBadge(r) {
    const map = {
      scheduled: ["🕐 مجدولة", "sch"], publishing: ["⏳ تُنشر…", "sch"],
      published: ["✅ منشورة", "ok"], failed: ["⚠️ فشلت", "err"], draft: ["✏️ مسودة", "sch"],
    };
    const [txt, cls] = map[r.status] || [esc(r.status || "غير معروف"), "sch"];
    return `<span class="qbadge ${cls}">${txt}</span>`;
  }

  function renderChannels() {
    const wrap = $id("acctChannels"); if (!wrap) return;
    wrap.innerHTML = Object.entries(PLATFORMS).map(([k, p]) => {
      const c = conns.find(x => x.platform === k);
      const igAttached = k === "instagram" && !c && conns.find(x => x.platform === "facebook")?.extra?.ig;
      const linked = !!c;
      const sub = linked
        ? (k === "facebook" && c.extra?.pages?.length ? esc(c.account_name + " · " + c.extra.pages.length + " صفحة") : esc(c.account_name))
        : (igAttached ? "متاح عبر ربط فيسبوك" : "غير مرتبطة");
      return `<div class="chan-card ${linked ? "on" : ""}">
        <div class="chan-ic">${p.icon}</div>
        <div class="chan-info">
          <b>${p.name}</b>
          <small class="${linked ? "ok" : ""}">${linked ? "✓ " + sub : sub}</small>
        </div>
        ${linked
          ? `<button class="btn btn-ghost btn-sm" data-disc="${c.id}">فك الربط</button>`
          : `<button class="btn btn-em btn-sm" data-conn="${k}">اربط</button>`}
      </div>`;
    }).join("");
    wrap.querySelectorAll("[data-conn]").forEach(b => b.onclick = async () => {
      const k = b.dataset.conn;
      const t = await QRAuth.token();
      if (!t) { openLogin(); return; }
      const pk = k === "facebook" ? "meta" : k;
      location.href = `/api/oauth?op=start&p=${pk}&t=${encodeURIComponent(t)}`;
    });
    wrap.querySelectorAll("[data-disc]").forEach(b => b.onclick = async () => {
      const t = await QRAuth.token();
      await fetch("/api/social?op=disconnect", { method: "POST", headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: JSON.stringify({ id: b.dataset.disc }) });
      toast("تم فك الربط");
      refreshAccount();
    });
  }

  function renderQueue() {
    const wrap = $id("acctQueue"); if (!wrap) return;
    if (!QRAuth.user()) {
      wrap.innerHTML = `<div class="acct-empty"><span>🔒</span><div><b>جدولك محفوظ في حسابك</b><p>سجّل الدخول لعرض المهام المجدولة وإدارة النشر.</p></div><button class="btn btn-em btn-sm" id="queueLogin">دخول آمن</button></div>`;
      $id("queueLogin")?.addEventListener("click", openLogin, { once: true });
      return;
    }
    if (!queue.length) {
      wrap.innerHTML = `<div class="acct-empty"><span>🗓️</span><div><b>لا توجد مهام بعد</b><p>ارفع فيديو من هنا أو أنشئ ريلًا ثم اختر «جدولة للنشر».</p></div><a class="btn btn-ghost btn-sm" href="#/">إنشاء ريل ←</a></div>`;
      return;
    }
    wrap.innerHTML = queue.map(r => {
      const p = PLATFORMS[r.platform] || { name: esc(r.platform || "منصة"), icon: "•" };
      const d = new Date(r.publish_at);
      const when = isNaN(d) ? "وقت غير محدد" : d.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
      const canAct = r.status === "scheduled" || r.status === "failed";
      const external = /^https?:\/\//i.test(String(r.external_url || ""))
        ? ` · <a href="${esc(r.external_url)}" target="_blank" rel="noopener noreferrer">فتح ↗</a>` : "";
      return `<div class="qrow">
        <span class="qic" aria-hidden="true">${p.icon}</span>
        <div class="qinfo">
          <b>${esc(r.title || "ريلز")}</b>
          <small>${esc(p.name)} · ${esc(when)}${r.error ? ` · <i class="qerr">${esc(String(r.error).slice(0, 90))}</i>` : ""}${external}</small>
        </div>
        ${statusBadge(r)}
        <div class="qacts">
          ${canAct ? `<button class="btn btn-gold btn-sm" data-pub="${esc(r.id)}">انشر الآن</button>` : ""}
          <button class="btn btn-ghost btn-sm" data-del="${esc(r.id)}">حذف</button>
        </div>
      </div>`;
    }).join("");
    wrap.querySelectorAll("[data-pub]").forEach(b => b.onclick = () => publishNow(b.dataset.pub, b));
    wrap.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
      if (!window.confirm("حذف هذه المهمة من جدول النشر؟ لا يمكن التراجع عن الحذف.")) return;
      const u = QRAuth.user();
      try {
        await sb(`/rest/v1/publish_queue?id=eq.${encodeURIComponent(b.dataset.del)}&user_id=eq.${encodeURIComponent(u.id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
        toast("حُذفت المهمة");
        await refreshAccount();
      } catch (e) { toast(String(e.message || "تعذّر حذف المهمة"), "err"); }
    });
  }

  function youtubeVideoId(value) {
    try {
      const u = new URL(String(value || ""));
      if (u.protocol !== "https:" || !["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(u.hostname.toLowerCase())) return "";
      let id = "";
      if (u.hostname.toLowerCase() === "youtu.be") id = u.pathname.split("/").filter(Boolean)[0] || "";
      else id = u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{11})(?:\/|$)/)?.[1] || u.searchParams.get("v") || "";
      return /^[\w-]{11}$/.test(id) ? id : "";
    } catch { return ""; }
  }

  function renderAutoRuns() {
    const wrap = $id("acctRunList"); if (!wrap) return;
    const channel = $id("acctRunChannel");
    if (channel) {
      channel.textContent = autopilotChannel ? `قناة YouTube: ${autopilotChannel}` : "سجل النشر التلقائي";
      channel.hidden = !autopilotChannel;
    }
    if (!QRAuth.user()) {
      wrap.innerHTML = `<div class="acct-empty"><span>🔒</span><div><b>سجل الفيديوهات خاص بحسابك</b><p>سجّل الدخول لعرض الفيديوهات المنشورة وتفاصيلها.</p></div><button class="btn btn-em btn-sm" id="runsLogin" type="button">تسجيل الدخول</button></div>`;
      $id("runsLogin")?.addEventListener("click", openLogin, { once: true });
      return;
    }
    if (!autopilotRuns.length) {
      const linked = conns.some(x => x.platform === "youtube");
      wrap.innerHTML = `<div class="acct-empty"><span>${linked ? "🎬" : "🔗"}</span><div><b>${linked ? "لم يُنشر فيديو تلقائي بعد" : "اربط قناة YouTube أولًا"}</b><p>${linked ? "سيظهر أول فيديو هنا بعد تشغيل الموعد اليومي، مع معاينة وعنوان ووصف وهاشتاقات ورابط المشاهدة." : "بعد ربط القناة، ستظهر هنا معاينات الفيديوهات المنشورة وتفاصيلها."}</p></div></div>`;
      return;
    }
    const labels = {
      rendering: ["⏳ جارٍ إنشاء الفيديو", "sch"],
      queued: ["🕐 بانتظار النشر", "sch"],
      published: ["✅ منشور", "ok"],
      failed: ["⚠️ تعذّر النشر", "err"],
    };
    wrap.innerHTML = autopilotRuns.map(run => {
      const [statusText, statusClass] = labels[run.status] || [esc(run.status || "حالة غير معروفة"), "sch"];
      const id = youtubeVideoId(run.external_url);
      const date = new Date(run.completed_at || run.created_at || run.run_date);
      const when = isNaN(date) ? esc(run.run_date || "") : esc(date.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }));
      const tags = String(run.hashtags || "").split(",").map(x => x.trim().replace(/^#+/, "")).filter(Boolean).slice(0, 20);
      const tagHtml = tags.length ? tags.map(t => `<span class="acct-run-tag">#${esc(t)}</span>`).join("") : `<span class="hint">لا توجد هاشتاقات محفوظة لهذا التشغيل.</span>`;
      const video = id ? `<div class="acct-run-video"><iframe src="https://www.youtube-nocookie.com/embed/${id}?rel=0" title="${esc(run.title || "فيديو قرآن منشور على YouTube")}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; encrypted-media; picture-in-picture; web-share" allowfullscreen></iframe></div>` : `<div class="acct-run-video acct-run-placeholder"><span aria-hidden="true">${run.status === "rendering" ? "⏳" : "🎬"}</span><b>${run.status === "rendering" ? "جارٍ تجهيز الفيديو" : "لا تتوفر معاينة بعد"}</b></div>`;
      const watch = id ? `<a class="btn btn-gold btn-sm" href="https://www.youtube.com/shorts/${id}" target="_blank" rel="noopener noreferrer">▶ مشاهدة على القناة</a>` : "";
      const caption = String(run.caption || "").trim();
      const details = caption || tags.length ? `<details class="acct-run-details"><summary>العنوان والوصف والهاشتاقات</summary>${caption ? `<p>${esc(caption)}</p>` : ""}<div class="acct-run-tags">${tagHtml}</div></details>` : "";
      return `<article class="acct-run-card"><div class="acct-run-content"><div class="acct-run-top"><span class="qbadge ${statusClass}">${statusText}</span><small>${when}</small></div><h3>${esc(run.title || "ريلز قرآن")}</h3><p class="acct-run-meta">${run.reciter ? `🎙️ ${esc(run.reciter)} · ` : ""}${run.recipe_key ? `الآيات ${esc(run.recipe_key)}` : "تشغيل تلقائي"}</p>${details}<div class="acct-run-actions">${watch}</div>${run.status === "failed" && run.error ? `<p class="acct-run-error">${esc(String(run.error).slice(0, 240))}</p>` : ""}</div>${video}</article>`;
    }).join("");
  }

  async function refreshAutoRuns() {
    const button = $id("acctRunsRefresh");
    if (button) { button.disabled = true; button.textContent = "جارٍ التحديث…"; }
    await loadAutoHistory();
    renderAutoRuns(); renderDataNotice();
    if (button) { button.disabled = false; button.textContent = "↻ تحديث السجل"; }
    if (!accountErrors.length) toast("تم تحديث سجل الفيديوهات");
  }

  async function publishNow(id, btn) {
    const item = queue.find(x => String(x.id) === String(id));
    if (!item) return toast("لم نعثر على هذه المهمة — حدّث الجدول", "err");
    const platform = PLATFORMS[item.platform]?.name || item.platform || "المنصة";
    if (!window.confirm(`سيُنشر «${item.title || "ريلز"}» الآن علنًا على ${platform}. هل تريد المتابعة؟`)) return;
    if (btn) { btn.disabled = true; btn.textContent = "جارٍ النشر…"; }
    try {
      const t = await QRAuth.token();
      const r = await fetch("/api/publish", { method: "POST", headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: JSON.stringify({ queue_id: id }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) toast("تم النشر بنجاح 🎉"); else toast(j.error || "تعذّر النشر — راجع ربط المنصة", "err");
    } catch (e) { toast(String(e.message || e), "err"); }
    await refreshAccount();
  }

  function renderStats() {
    const wrap = $id("acctStats"); if (!wrap) return;
    if (!QRAuth.user()) { wrap.hidden = true; wrap.innerHTML = ""; return; }
    const scheduled = queue.filter(x => ["scheduled", "publishing"].includes(x.status)).length;
    const published = queue.filter(x => x.status === "published").length;
    const failed = queue.filter(x => x.status === "failed").length;
    const linked = conns.length;
    const cards = [
      ["قنوات مرتبطة", linked, "🔗", "acct-metric-link"],
      ["في الجدول", scheduled, "🗓️", ""],
      ["نُشرت", published, "✅", ""],
      ["تحتاج مراجعة", failed, "⚠️", failed ? "acct-metric-warn" : ""],
    ];
    wrap.innerHTML = cards.map(([label, value, icon, cls]) => `<div class="acct-metric ${cls}"><span aria-hidden="true">${icon}</span><div><b>${value}</b><small>${label}</small></div></div>`).join("");
    wrap.hidden = false;
  }

  function renderQuickActions() {
    const wrap = $id("acctQuickActions"); if (!wrap) return;
    if (!QRAuth.user()) { wrap.hidden = true; wrap.innerHTML = ""; return; }
    wrap.innerHTML = `<div class="acct-quick-label"><span class="acct-kicker">اختصارات</span><b>ماذا تريد أن تفعل؟</b></div>
      <a class="btn btn-gold" href="#/">＋ إنشاء ريل</a>
      <button class="btn btn-em" id="quickUpload" type="button">⬆ رفع وجدولة فيديو</button>
      <button class="btn btn-ghost" id="quickRefresh" type="button">↻ تحديث البيانات</button>`;
    wrap.hidden = false;
    $id("quickUpload")?.addEventListener("click", () => $id("schedFile")?.click());
    $id("quickRefresh")?.addEventListener("click", async e => {
      const b = e.currentTarget; b.disabled = true; b.textContent = "جارٍ التحديث…";
      await refreshAccount();
      toast("تم تحديث الحساب");
    }, { once: true });
  }

  async function renderAuto() {
    const wrap = $id("acctAuto"); if (!wrap) return;
    if (!QRAuth.user()) {
      wrap.innerHTML = `<div class="acct-section-head"><div><span class="acct-kicker">اختياري بالكامل</span><h2>الأتمتة اليومية</h2></div><span class="acct-lock">🔒 تتطلب تسجيل الدخول</span></div>
        <p class="hint">يبقى النشر التلقائي متوقفًا افتراضيًا. سجّل الدخول أولًا لإدارة الإعدادات؛ لن يتم تفعيل النشر دون حفظ اختيارك.</p>
        <button class="btn btn-em btn-sm" id="autoLogin" type="button">دخول لإدارة الأتمتة</button>`;
      $id("autoLogin")?.addEventListener("click", openLogin, { once: true });
      return;
    }
    const stored = await loadAuto();
    const a = stored || { enabled: false, at_utc: "04:15:00", platforms: ["youtube"] };
    const plats = Array.isArray(a.platforms) ? a.platforms : ["youtube"];
    wrap.innerHTML = `
      <div class="acct-section-head"><div><span class="acct-kicker">متوقفة افتراضيًا</span><h2>إعدادات الأتمتة</h2></div>
        <label class="switch" aria-label="تفعيل النشر اليومي"><input type="checkbox" id="autoOn" ${a.enabled ? "checked" : ""}><i></i></label>
      </div>
      <p class="hint">عند التفعيل، تُراجع المهام المؤهلة يوميًا قرابة <b>04:15 UTC</b> (06:15 شتاءً / 07:15 صيفًا بتوقيت القاهرة). قد يتأخر تشغيل Vercel حتى 59 دقيقة؛ ويمكنك إيقاف الأتمتة من هنا في أي وقت.</p>
      <div class="auto-row"><b class="acct-plat-label">المنصات المسموح بها:</b>
        ${Object.entries(PLATFORMS).map(([k, p]) => `<label class="chk"><input type="checkbox" class="autoPlat" value="${k}" ${plats.includes(k) ? "checked" : ""}> ${p.icon} ${p.name}</label>`).join("")}
      </div>
      <div class="acct-auto-footer"><span class="hint">الحالة الحالية: <b class="${a.enabled ? "acct-state-on" : "acct-state-off"}">${a.enabled ? "مفعّلة" : "متوقفة"}</b></span><button class="btn btn-gold" id="autoSave" type="button">حفظ الإعدادات</button></div>`;
    $id("autoSave").onclick = async () => {
      const enabled = $id("autoOn").checked;
      const platforms = [...document.querySelectorAll(".autoPlat:checked")].map(x => x.value);
      if (enabled && !platforms.length) return toast("اختر منصة واحدة على الأقل قبل التفعيل", "err");
      if (enabled && !a.enabled && !window.confirm("تفعيل الأتمتة يسمح بنشر المهام المؤهلة علنًا وبشكل آلي. هل تؤكد التفعيل؟")) {
        $id("autoOn").checked = false;
        return;
      }
      const b = $id("autoSave"); b.disabled = true; b.textContent = "جارٍ الحفظ…";
      try {
        await saveAuto({ enabled, platforms, at_utc: (a.at_utc || "04:15:00") });
        toast(enabled ? "تم تفعيل الأتمتة حسب اختيارك 🤖" : "تم إيقاف الأتمتة وحفظ الإعدادات");
        a.enabled = enabled; a.platforms = platforms;
        await renderAuto();
      } catch (e) { b.disabled = false; b.textContent = "حفظ الإعدادات"; toast(String(e.message || "تعذّر حفظ الإعدادات"), "err"); }
    };
  }

  function renderAuthCard() {
    const wrap = $id("acctAuth"); if (!wrap) return;
    const u = QRAuth.user();
    if (u) {
      wrap.innerHTML = `<div class="card acct-user">
        <div class="avatar" aria-hidden="true">${esc((u.name || u.email || "?").charAt(0).toUpperCase())}</div>
        <div class="acct-user-meta"><b>${esc(u.name || u.email || "حسابي")}</b><small class="hint">${esc(u.email || "")}</small></div>
        <span class="acct-session"><i></i> جلسة نشطة</span>
        <button class="btn btn-ghost btn-sm" id="acctLogout" type="button">تسجيل الخروج</button>
      </div>`;
      $id("acctLogout").onclick = () => { QRAuth.signOut().then(() => { toast("تم تسجيل الخروج"); refreshAccount(); }); };
    } else {
      wrap.innerHTML = `<div class="card acct-login">
        <h3>🔑 سجّل لتبدأ الأتمتة</h3>
        <p class="hint">حساب واحد يفتح: حفظ الفيديوهات، الربط بالمنصات، جدولة النشر، والأتمتة اليومية. الموقع يبقى يعمل للجميع بلا تسجيل.</p>
        <div class="login-row">
          <input type="email" id="acctEmail" placeholder="name@example.com" autocomplete="email" inputmode="email" required dir="ltr" aria-label="البريد الإلكتروني">
          <button class="btn btn-gold" id="acctMagic" type="button">أرسل رابط الدخول</button>
        </div>
        <button class="btn btn-em w100" id="acctGoogle" type="button">G المتابعة بجوجل</button>
        <p class="hint center" style="margin-top:8px">لا كلمات مرور — يصلك رابط سحري لبريدك أو الدخول بحساب جوجل.</p>
      </div>`;
      $id("acctMagic").onclick = async () => {
        const em = ($id("acctEmail").value || "").trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return toast("أدخل بريدًا صحيحًا", "err");
        const b = $id("acctMagic"); b.disabled = true; b.textContent = "جارٍ الإرسال…";
        try { await QRAuth.magicLink(em); toast("✓ أرسلنا رابط الدخول — تفقد بريدك"); }
        catch (e) { toast(e.message, "err"); }
        finally { b.disabled = false; b.textContent = "أرسل رابط الدخول"; }
      };
      $id("acctGoogle").onclick = () => QRAuth.google();
    }
  }

  function renderNotice() {
    const wrap = $id("acctNotice"); if (!wrap) return;
    const h = location.hash || "";
    const mSetup = h.match(/setup=(\w+)/), mLinked = h.match(/linked=(\w+)/);
    if (mSetup && SETUP_TEXT[mSetup[1]]) {
      const s = SETUP_TEXT[mSetup[1]];
      wrap.hidden = false;
      wrap.innerHTML = `<b>⚙️ هذه المنصة تحتاج إعدادًا أولًا (مرة واحدة، مطوّر الموقع فقط):</b>
        <ol class="setup-list">
          <li>أنشئ التطبيق لدى: ${s.where}</li>
          <li>سجّل رابط إعادة التوجيه: <code>${location.origin}${s.redirect}</code></li>
          <li>أضِف المتغيرات في Vercel: <code>${s.env}</code></li>
          <li>أعد النشر — وسيختفي هذا التنبيه.</li>
        </ol>`;
      history.replaceState(null, "", location.pathname + "#/account");
    } else if (mLinked) {
      wrap.hidden = true;
      const k = mLinked[1];
      if (k.endsWith("_err")) toast("تعذّر إتمام الربط — تأكد من الموافقة على الصلاحيات", "err");
      else if (k !== "undefined") toast("تم الربط بنجاح 🎉");
      history.replaceState(null, "", location.pathname + "#/account");
    } else wrap.hidden = true;
  }

  function renderDataNotice() {
    const wrap = $id("acctDataNotice"); if (!wrap) return;
    const messages = [...new Set(accountErrors)];
    if (!messages.length) { wrap.hidden = true; wrap.innerHTML = ""; return; }
    wrap.hidden = false;
    wrap.innerHTML = `<div class="acct-error-line"><span aria-hidden="true">⚠️</span><div><b>بعض بيانات الحساب لم تُحمّل</b><p>${messages.map(esc).join(" ")}</p></div><button class="btn btn-ghost btn-sm" id="acctDataRetry" type="button">إعادة المحاولة</button></div>`;
    $id("acctDataRetry")?.addEventListener("click", async e => {
      const b = e.currentTarget; b.disabled = true; b.textContent = "جارٍ التحديث…";
      await refreshAccount();
    }, { once: true });
  }

  async function refreshAccount() {
    accountErrors = [];
    renderNotice();
    renderAuthCard();
    const u = QRAuth.user();
    const howto = $id("acctHowTo"); if (howto) howto.hidden = !!u;
    if (u) await Promise.all([loadConnections(), loadQueue(), loadAutoHistory()]);
    else { conns = []; queue = []; autopilotRuns = []; autopilotChannel = ""; }
    renderStats(); renderQuickActions();
    renderChannels(); renderQueue(); renderAutoRuns();
    await renderAuto();
    renderDataNotice();
    const runsRefresh = $id("acctRunsRefresh");
    if (runsRefresh) runsRefresh.onclick = refreshAutoRuns;
    const ns = $id("btnNewSched");
    if (ns) ns.onclick = () => {
      if (!QRAuth.user()) { openLogin(); return; }
      $id("schedFile")?.click();
    };
  }

  /* ---------- نافذة الجدولة ---------- */
  function selMeta() {
    try {
      const reciterName = (typeof RECITERS !== "undefined" && typeof Selection !== "undefined")
        ? (RECITERS.find(r => r.folder === Selection.reciter) || {}).n || "" : "";
      let surahName = "";
      try { if (typeof Quran !== "undefined" && typeof Selection !== "undefined") surahName = Quran.shortName(Selection.surah); } catch {}
      return {
        surah: surahName || "القرآن",
        from: typeof Selection !== "undefined" ? Selection.from : 1,
        to: typeof Selection !== "undefined" ? Selection.to : 1,
        reciter: reciterName,
      };
    } catch { return { surah: "القرآن", from: 1, to: 30, reciter: "" }; }
  }

  function openSchedule(path, blob) {
    schedPath = path || ""; schedBlob = blob || null;
    const modal = $id("schedOverlay");
    const def = PostGen.generate("youtube", selMeta());
    $id("schedTitle").value = def.title;
    $id("schedCaption").value = def.caption;
    $id("schedTags").value = def.hashtags;
    const d = new Date(Date.now() + 3600e3);
    d.setSeconds(0, 0);
    $id("schedWhen").value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    $id("schedFileLabel").textContent = schedPath ? "✓ الفيديو جاهز (سيُرفع تلقائيًا عند الحفظ)" : "";
    modal.hidden = false;
  }
  async function submitSchedule() {
    const checked = [...document.querySelectorAll(".schedPlat:checked")].map(x => x.value);
    if (!checked.length) return toast("اختر منصة واحدة على الأقل", "err");
    const when = $id("schedWhen").value;
    if (!when) return toast("حدد وقت النشر", "err");
    const title = ($id("schedTitle").value || "ريلز قرآن").trim();
    const caption = ($id("schedCaption").value || "").trim();
    const hashtags = ($id("schedTags").value || "").trim();
    try {
      const u = QRAuth.user(); if (!u) { $id("schedOverlay").hidden = true; return openLogin(); }
      let path = schedPath;
      if (!path && schedBlob) {
        path = await uploadVideo(schedBlob, "scheduled.mp4");
      } else if (!path) { return toast("لا يوجد فيديو", "err"); }
      const publish_at = new Date(when).toISOString();
      const rows = checked.map(p => ({
        user_id: u.id, platform: p, video_path: path, video_name: "reel.mp4",
        title: title.slice(0, 120), caption: caption.slice(0, 4000), hashtags: hashtags.slice(0, 500),
        status: "scheduled", publish_at,
      }));
      await sb(`/rest/v1/publish_queue`, { method: "POST", headers: restHeaders(), body: JSON.stringify(rows) });
      $id("schedOverlay").hidden = true;
      const past = new Date(publish_at) <= Date.now();
      toast(past ? "تمت الجدولة — ستُنشر خلال دقائق" : `مجدولة على ${checked.length} منصة ✓`);
      if (QRAuth.user()) { await loadQueue(); renderQueue(); }
    } catch (e) { toast(String(e.message || e), "err"); }
  }

  function openLogin() { $id("loginOverlay").hidden = false; }

  function wireGlobals() {
    const b = $id("btnSchedule"); // من نافذة نتيجة الإنشاء — يُربط في creator
    const sf = $id("schedFile");
    if (sf) sf.onchange = async () => {
      const f = sf.files?.[0]; if (!f) return;
      if (!QRAuth.user()) { openLogin(); sf.value = ""; return; }
      try {
        toast("جارٍ رفع الفيديو إلى حسابك…");
        const path = await uploadVideo(f, f.name);
        openSchedule(path, null);
        $id("schedFileLabel").textContent = "✓ تم رفع الفيديو: " + f.name;
      } catch (e) { toast(String(e.message || e), "err"); }
      sf.value = "";
    };
    const ss = $id("schedSubmit"); if (ss) ss.onclick = submitSchedule;
    const sc = $id("schedCancel"); if (sc) sc.onclick = () => ($id("schedOverlay").hidden = true);
    const gen = $id("schedGen");
    if (gen) gen.onclick = () => {
      const list = [...document.querySelectorAll(".schedPlat:checked")].map(x => x.value);
      const p = list[0] || "youtube";
      const g = PostGen.generate(p, selMeta());
      $id("schedTitle").value = g.title; $id("schedCaption").value = g.caption; $id("schedTags").value = g.hashtags;
      toast("تم توليد بوست مناسب للمنصة ✨");
    };
    const lb = $id("loginSubmit");
    if (lb) lb.onclick = async () => {
      const em = ($id("loginEmail").value || "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return toast("أدخل بريدًا صحيحًا", "err");
      try { await QRAuth.magicLink(em); $id("loginOverlay").hidden = true; toast("✓ أرسلنا رابط الدخول إلى بريدك"); }
      catch (e) { toast(e.message, "err"); }
    };
    const lg = $id("loginGoogle"); if (lg) lg.onclick = () => QRAuth.google();
    document.querySelectorAll(".overlay .close-x").forEach(x => {
      if (!x.dataset.wired) { x.dataset.wired = "1"; x.onclick = () => x.closest(".overlay").hidden = true; }
    });
    const ab = $id("authBtn");
    if (ab) ab.onclick = () => { const u = QRAuth.user(); u ? Router.go("#/account") : openLogin(); };
  }

  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  return {
    PLATFORMS, PostGen,
    uploadVideo, openSchedule, refreshAccount, wireGlobals, openLogin,
    async scheduleFromExport(blob, name) {
      if (!QRAuth.user()) { window._schedPending = { blob, name }; openLogin(); return; }
      try {
        toast("جارٍ الحفظ في حسابك…");
        const path = await uploadVideo(blob, name);
        openSchedule(path, null);
      } catch (e) { toast(String(e.message || e), "err"); }
    },
    async afterLogin() {
      if (window._schedPending) {
        const { blob, name } = window._schedPending; window._schedPending = null;
        try { const path = await uploadVideo(blob, name); openSchedule(path, null); } catch (e) { toast(String(e.message || e), "err"); }
      }
      refreshAccount();
    },
  };
})();

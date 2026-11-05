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
  let conns = [], queue = [], schedBlob = null, schedPath = "";

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
      const j = await r.json();
      conns = j.connections || [];
    } catch { conns = []; }
  }
  async function loadQueue() {
    try {
      const u = QRAuth.user(); if (!u) { queue = []; return; }
      queue = await sb(`/rest/v1/publish_queue?user_id=eq.${u.id}&order=publish_at.desc&limit=50`);
      if (!Array.isArray(queue)) queue = [];
    } catch { queue = []; }
  }
  async function loadAuto() {
    try {
      const u = QRAuth.user(); if (!u) return null;
      const rows = await sb(`/rest/v1/autopilot?user_id=eq.${u.id}`);
      return Array.isArray(rows) && rows[0] ? rows[0] : null;
    } catch { return null; }
  }
  async function loadRuns() {
    try {
      const u = QRAuth.user(); if (!u) return [];
      const rows = await sb(`/rest/v1/autopilot_runs?user_id=eq.${u.id}&order=created_at.desc&limit=20`);
      return Array.isArray(rows) ? rows : [];
    } catch { return []; }
  }
  async function clearRuns() {
    try {
      const u = QRAuth.user(); if (!u) return;
      await sb(`/rest/v1/autopilot_runs?user_id=eq.${u.id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      toast("تم مسح السجل");
      renderRuns();
    } catch { toast("تعذّر المسح", "err"); }
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
    const [txt, cls] = map[r.status] || [r.status, "sch"];
    return `<span class="qbadge ${cls}">${txt}</span>`;
  }

  function renderChannels() {
    const wrap = $id("acctChannels"); if (!wrap) return;
    // Group connections by platform
    const byPlat = {};
    for (const c of conns) { if (!byPlat[c.platform]) byPlat[c.platform] = []; byPlat[c.platform].push(c); }
    const html = Object.entries(PLATFORMS).map(([k, p]) => {
      const platConns = byPlat[k] || [];
      const igAttached = k === "instagram" && !platConns.length && conns.find(x => x.platform === "facebook")?.extra?.ig;
      if (!platConns.length) {
        return `<div class="chan-card">
          <div class="chan-ic">${p.icon}</div>
          <div class="chan-info">
            <b>${p.name}</b>
            <small>${igAttached ? "متاح عبر ربط فيسبوك" : "غير مرتبطة"}</small>
          </div>
          ${igAttached ? "" : `<button class="btn btn-em btn-sm" data-conn="${k}">اربط</button>`}
        </div>`;
      }
      return platConns.map(c => {
        const expired = c.expires_at && Number(c.expires_at) < Date.now();
        return `<div class="chan-card on">
          <div class="chan-ic">${p.icon}</div>
          <div class="chan-info">
            <b>${p.name}</b>
            <small class="ok">✓ ${k === "facebook" && c.extra?.pages?.length ? esc(c.account_name + " · " + c.extra.pages.length + " صفحة") : esc(c.account_name)}${expired ? " ⚠️ منتهي" : ""}</small>
          </div>
          <div style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-sm" data-test="${c.id}" title="اختبار">🔍</button>
            <button class="btn btn-ghost btn-sm" data-disc="${c.id}">فك</button>
          </div>
        </div>`;
      }).join("") + (k === "youtube" ? `<div class="chan-card" style="opacity:.7">
        <div class="chan-ic">${p.icon}</div>
        <div class="chan-info"><b>${p.name}</b><small>ربط قناة إضافية</small></div>
        <button class="btn btn-em btn-sm" data-conn="${k}">+ أضف</button>
      </div>` : "");
    }).join("");
    wrap.innerHTML = html;
    wrap.querySelectorAll("[data-conn]").forEach(b => b.onclick = async () => {
      const k = b.dataset.conn;
      const t = await QRAuth.token();
      if (!t) { openLogin(); return; }
      const pk = k === "facebook" ? "meta" : k;
      location.href = `/api/oauth?op=start&p=${pk}&t=${encodeURIComponent(t)}`;
    });
    wrap.querySelectorAll("[data-test]").forEach(b => b.onclick = async () => {
      const t = await QRAuth.token();
      const r = await fetch("/api/social?op=test", { method: "POST", headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: JSON.stringify({ id: b.dataset.test }) });
      const j = await r.json().catch(() => ({}));
      toast(j.ok ? "✓ الاتصال يعمل" : (j.error || "فشل الاتصال"), j.ok ? "" : "err");
    });
    wrap.querySelectorAll("[data-disc]").forEach(b => b.onclick = async () => {
      if (!confirm("هل تريد فك الربط؟")) return;
      const t = await QRAuth.token();
      await fetch("/api/social?op=disconnect", { method: "POST", headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: JSON.stringify({ id: b.dataset.disc }) });
      toast("تم فك الربط");
      refreshAccount();
    });
  }

  async function renderQueue() {
    const wrap = $id("acctQueue"); if (!wrap) return;
    // عرض القنوات المربوطة في أعلى جدول النشر
    const chanSummary = conns.length ? `<div class="kanban-channels">
      <span class="kc-label">القنوات المربوطة:</span>
      ${conns.map(c => {
        const p = PLATFORMS[c.platform] || { name: c.platform, icon: "•" };
        return `<span class="kc-chip">${p.icon} ${esc(c.account_name)}</span>`;
      }).join("")}
      ${conns.filter(c => c.platform === "youtube").length > 1 ? `<span class="kc-chip" style="background:rgba(212,175,55,.15)">🎬 ${conns.filter(c => c.platform === "youtube").length} قنوات YouTube</span>` : ""}
    </div>` : `<div class="hint" style="padding:8px 0">لا توجد قنوات مربوطة — اربط من "ربط المنصات" أعلاه.</div>`;
    if (!queue.length) { wrap.innerHTML = chanSummary + `<div class="hint" style="padding:20px;text-align:center">لا مهام بعد — أنشئ فيديو ثم اضغط «جدولة للنشر»، أو أضف ملفًا من هنا.</div>`; return; }
    const cols = [
      { key: "scheduled", label: "🕐 مجدولة", cls: "sch" },
      { key: "publishing", label: "⏳ تُنشر", cls: "sch" },
      { key: "published", label: "✅ منشورة", cls: "ok" },
      { key: "failed", label: "⚠️ فشلت", cls: "err" },
    ];
    const byStatus = {};
    for (const c of cols) byStatus[c.key] = [];
    for (const r of queue) {
      const st = r.status === "draft" ? "scheduled" : r.status;
      if (byStatus[st]) byStatus[st].push(r); else byStatus.scheduled.push(r);
    }
    wrap.innerHTML = chanSummary + `<div class="kanban-cols">${cols.map(col => {
      const items = byStatus[col.key] || [];
      return `<div class="kanban-col">
        <div class="kanban-col-head ${col.cls}">${col.label} <span class="kanban-count">${items.length}</span></div>
        <div class="kanban-col-body">
          ${items.map(r => {
            const p = PLATFORMS[r.platform] || { name: r.platform, icon: "•" };
            const d = new Date(r.publish_at);
            const when = isNaN(d) ? "" : d.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
            const canAct = r.status === "scheduled" || r.status === "failed";
            return `<div class="kanban-card">
              <div class="kc-head">
                <span class="kc-icon">${p.icon}</span>
                <b>${esc(r.title || "ريلز")}</b>
              </div>
              <small class="kc-meta">${p.name} · ${when}</small>
              ${r.error ? `<small class="kc-err">${esc(r.error.slice(0, 60))}</small>` : ""}
              ${r.external_url ? `<a class="kc-link" href="${esc(r.external_url)}" target="_blank" rel="noopener">فتح ↗</a>` : ""}
              <div class="kc-acts">
                ${canAct ? `<button class="btn btn-gold btn-sm" data-pub="${r.id}">انشر الآن</button>` : ""}
                <button class="btn btn-ghost btn-sm" data-del="${r.id}">حذف</button>
              </div>
            </div>`;
          }).join("")}
          ${!items.length ? `<div class="kanban-empty">لا مهام</div>` : ""}
        </div>
      </div>`;
    }).join("")}</div>`;
    wrap.querySelectorAll("[data-pub]").forEach(b => b.onclick = () => publishNow(b.dataset.pub, b));
    wrap.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
      const u = QRAuth.user();
      await sb(`/rest/v1/publish_queue?id=eq.${b.dataset.del}&user_id=eq.${u.id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
      toast("حُذفت المهمة");
      refreshAccount();
    });
  }

  async function publishNow(id, btn) {
    if (btn) { btn.disabled = true; btn.textContent = "…"; }
    try {
      const t = await QRAuth.token();
      const r = await fetch("/api/publish", { method: "POST", headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: JSON.stringify({ queue_id: id }) });
      const j = await r.json().catch(() => ({}));
      if (j.ok) { toast("تم النشر بنجاح 🎉"); logActivity("نشر ناجح: " + (id || "")); } else { toast(j.error || "تعذّر النشر — راجع ربط المنصة", "err"); logActivity("فشل نشر: " + (j.error || "")); }
    } catch (e) { toast(String(e.message || e), "err"); }
    refreshAccount();
  }

  async function renderAuto() {
    const wrap = $id("acctAuto"); if (!wrap) return;
    const a = await loadAuto() || { enabled: false, at_utc: "04:15:00", platforms: ["youtube"], youtube_connection_ids: [], template: {} };
    const plats = Array.isArray(a.platforms) ? a.platforms : ["youtube"];
    const ytConns = conns.filter(c => c.platform === "youtube");
    const selYt = Array.isArray(a.youtube_connection_ids) ? a.youtube_connection_ids : [];
    const tmpl = a.template || {};
    const hhmm = (a.at_utc || "04:15:00").slice(0, 5);
    wrap.innerHTML = `
      <div class="auto-head">
        <h3>🤖 الأتمتة — النشر التلقائي اليومي</h3>
        <label class="switch"><input type="checkbox" id="autoOn" ${a.enabled ? "checked" : ""}><i></i></label>
      </div>
      <p class="hint">تُنشر ريلز قرآنية آليًا يوميًا. الأتمتة تولّد فيديو وتختار آية عشوائيًا ثم تنشره على المنصات المختارة.</p>
      <div class="auto-row">
        <label>المنصات المفعّلة:</label>
        ${Object.entries(PLATFORMS).map(([k, p]) => `<label class="chk"><input type="checkbox" class="autoPlat" value="${k}" ${plats.includes(k) ? "checked" : ""}> ${p.icon} ${p.name}</label>`).join("")}
      </div>
      ${ytConns.length ? `
      <div class="auto-row">
        <label>قنوات YouTube للأتمتة:</label>
        ${ytConns.map(c => `<label class="chk"><input type="checkbox" class="autoYt" value="${esc(c.id)}" ${selYt.includes(c.id) ? "checked" : ""}> 🎬 ${esc(c.account_name)}</label>`).join("")}
      </div>` : ""}
      <div class="auto-row">
        <label>نمط المحتوى:</label>
        <select id="autoContentMode" class="sel-sm">
          <option value="mix" ${tmpl.content_mode === "mix" ? "selected" : ""}>مزيج (آيات + أدعية)</option>
          <option value="ayah" ${tmpl.content_mode === "ayah" ? "selected" : ""}>آيات فقط</option>
          <option value="dua" ${tmpl.content_mode === "dua" ? "selected" : ""}>أدعية فقط</option>
        </select>
      </div>
      <div class="auto-row">
        <label>نمط القارئ:</label>
        <select id="autoReciterMode" class="sel-sm">
          <option value="rotate" ${tmpl.reciter_mode === "rotate" ? "selected" : ""}>تناوب (عشوائي)</option>
          <option value="fixed" ${tmpl.reciter_mode === "fixed" ? "selected" : ""}>ثابت</option>
        </select>
      </div>
      <div class="auto-row">
        <label>نمط الخلفية:</label>
        <select id="autoBgMode" class="sel-sm">
          <option value="rotate" ${tmpl.background === "rotate" ? "selected" : ""}>تناوب (عشوائي)</option>
          <option value="fixed" ${tmpl.background === "fixed" ? "selected" : ""}>ثابت</option>
        </select>
      </div>
      <div class="auto-row">
        <label>رسالة مخصصة:</label>
        <input type="text" id="autoMsg" class="inp-sm" value="${esc(tmpl.custom_message || "")}" placeholder="صدقه جارية...">
      </div>
      <div class="auto-row">
        <label>عدد الفيديوهات يوميًا:</label>
        <select id="autoDailyCount" class="sel-sm">
          <option value="1" ${a.daily_count == 1 ? "selected" : ""}>1 فيديو</option>
          <option value="2" ${a.daily_count == 2 ? "selected" : ""}>2 فيديو</option>
          <option value="3" ${a.daily_count == 3 ? "selected" : ""}>3 فيديوهات</option>
          <option value="4" ${a.daily_count == 4 ? "selected" : ""}>4 فيديوهات</option>
        </select>
        <small class="hint" style="margin-inline-start:8px">موزّعة على 24 ساعة (0:00، 8:00، 16:00 UTC)</small>
      </div>
      <div class="auto-row" style="gap:8px">
        <button class="btn btn-gold" id="autoSave">حفظ الأتمتة</button>
        <button class="btn btn-em btn-sm" id="autoRunNow">▶ تشغيل الآن</button>
      </div>`;
    const runBtn = $id("autoRunNow");
    if (runBtn) runBtn.onclick = async () => {
      runBtn.disabled = true; runBtn.textContent = "…";
      try {
        const t = await QRAuth.token();
        const r = await fetch("/api/publish", { method: "POST", headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: JSON.stringify({ autopilot: true }) });
        const j = await r.json().catch(() => ({}));
        if (j.ok) toast("تم تشغيل الأتمتة ✓");
        else toast(j.error || "تم تشغيل الأتمتة ✓");
      } catch (e) { toast(String(e.message || e), "err"); }
      runBtn.disabled = false; runBtn.textContent = "▶ تشغيل الآن";
      renderRuns();
    };
    $id("autoSave").onclick = async () => {
      const enabled = $id("autoOn").checked;
      const platforms = [...document.querySelectorAll(".autoPlat:checked")].map(x => x.value);
      const ytIds = [...document.querySelectorAll(".autoYt:checked")].map(x => x.value);
      const template = {
        content_mode: $id("autoContentMode") ? $id("autoContentMode").value : "mix",
        reciter_mode: $id("autoReciterMode") ? $id("autoReciterMode").value : "rotate",
        background: $id("autoBgMode") ? $id("autoBgMode").value : "rotate",
        custom_message: $id("autoMsg") ? $id("autoMsg").value : "",
        privacy: "public",
        purpose: "general",
        reciter: "",
        video_style: "rotate",
      };
      const atUtc = "00:00:00";
      const dailyCount = $id("autoDailyCount") ? parseInt($id("autoDailyCount").value) : (a.daily_count || 3);
      try {
        await saveAuto({ enabled, platforms, at_utc: atUtc, youtube_connection_ids: ytIds, template, daily_count: dailyCount });
        toast(enabled ? "الأتمتة مفعّلة 🤖" : "تم حفظ الإعدادات");
        renderRuns();
      } catch (e) { toast("تعذّر الحفظ", "err"); }
    };
  }

  async function renderStats() {
    const runs = await loadRuns();
    const pub = runs.filter(r => r.status === "published").length;
    const fail = runs.filter(r => r.status === "failed").length;
    const sched = queue.filter(r => r.status === "scheduled" || r.status === "draft").length;
    const total = pub + fail;
    const rate = total > 0 ? Math.round((pub / total) * 100) : 0;
    const sp = $id("statPublished"); if (sp) sp.textContent = pub;
    const sf = $id("statFailed"); if (sf) sf.textContent = fail;
    const ss = $id("statScheduled"); if (ss) ss.textContent = sched;
    const sr = $id("statSuccess"); if (sr) sr.textContent = rate + "%";
  }

  async function renderRuns() {
    const wrap = $id("acctRuns"); if (!wrap) return;
    const runs = await loadRuns();
    if (!runs.length) { wrap.innerHTML = `<div class="hint">لا توجد عمليات بعد.</div>`; return; }
    wrap.innerHTML = runs.map(r => {
      const d = new Date(r.created_at);
      const when = isNaN(d) ? "" : d.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
      const statusMap = { rendering: "⏳ جارٍ", queued: "🕐 في الانتظار", published: "✅ منشور", failed: "⚠️ فشل" };
      const st = statusMap[r.status] || r.status;
      const cls = r.status === "published" ? "ok" : r.status === "failed" ? "err" : "sch";
      const channel = r.channel_name ? ` · ${esc(r.channel_name)}` : "";
      const daily = r.daily_total > 1 ? ` (${r.daily_index}/${r.daily_total})` : "";
      const canRerun = r.status === "failed" && r.run_key;
      const hasVideo = !!r.video_path;
      return `<div class="qrow">
        <span class="qic">🤖</span>
        <div class="qinfo">
          <b>${esc(r.step || r.status)}${channel}${daily}</b>
          <small>${when}${r.error ? ` · <i class="qerr">${esc(String(r.error).slice(0, 90))}</i>` : ""}${r.video_path ? ` · ${esc(r.video_path.split("/").pop())}` : ""}</small>
        </div>
        <span class="qbadge ${cls}">${st}</span>
        ${hasVideo ? `<a class="btn btn-ghost btn-sm" href="https://lbblhpscncqsyzvuujpw.supabase.co/storage/v1/object/public/reels/${esc(r.video_path)}" target="_blank" download>⬇️</a>` : ""}
        ${canRerun ? `<button class="btn btn-ghost btn-sm" data-rerun="${r.id}">↻ إعادة</button>` : ""}
      </div>`;
    }).join("") + `<div style="margin-top:8px;text-align:center"><button class="btn btn-ghost btn-sm" id="btnClearRuns">🗑️ مسح السجل</button></div>`;
    const cr = $id("btnClearRuns");
    if (cr) cr.onclick = () => { if (confirm("مسح كل السجل؟")) clearRuns(); };
    wrap.querySelectorAll("[data-rerun]").forEach(b => b.onclick = async () => {
      const t = await QRAuth.token();
      await fetch("/api/publish", { method: "POST", headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: JSON.stringify({ autopilot: true }) });
      toast("تم إعادة التشغيل");
      renderRuns();
    });
  }

  function renderAuthCard() {
    const wrap = $id("acctAuth"); if (!wrap) return;
    const u = QRAuth.user();
    if (u) {
      wrap.innerHTML = `<div class="card acct-user">
        <div class="avatar">${esc((u.name || u.email || "?").charAt(0).toUpperCase())}</div>
        <div><b>${esc(u.name || u.email || "حسابي")}</b><br><small class="hint">${esc(u.email || "")}</small></div>
        <div style="margin-inline-start:auto;display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" id="acctLogout">خروج</button>
        </div>
      </div>`;
      $id("acctLogout").onclick = () => { QRAuth.signOut().then(() => { toast("تم تسجيل الخروج"); refreshAccount(); }); };
    } else {
      wrap.innerHTML = `<div class="card acct-login">
        <h3>🔑 سجّل لتبدأ الأتمتة</h3>
        <p class="hint">حساب واحد يفتح: حفظ الفيديوهات، الربط بالمنصات، جدولة النشر، والأتمتة اليومية. الموقع يبقى يعمل للجميع بلا تسجيل.</p>
        <div class="login-row">
          <input type="email" id="acctEmail" placeholder="بريدك الإلكتروني" dir="ltr">
          <button class="btn btn-gold" id="acctMagic">أرسل رابط الدخول</button>
        </div>
        <button class="btn btn-em w100" id="acctGoogle">G المتابعة بجوجل</button>
        <p class="hint center" style="margin-top:8px">لا كلمات مرور — يصلك رابط سحري لبريدك أو الدخول بحساب جوجل.</p>
      </div>`;
      $id("acctMagic").onclick = async () => {
        const em = ($id("acctEmail").value || "").trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return toast("أدخل بريدًا صحيحًا", "err");
        try { await QRAuth.magicLink(em); toast("✓ أرسلنا رابط الدخول — تفقد بريدك"); }
        catch (e) { toast(e.message, "err"); }
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
      if (k === "youtube_err_state") toast("انتهت صلاحية الجلسة — أعد المحاولة", "err");
      else if (k === "youtube_err_token") toast("فشل تبادل التوكن — تأكد من إعدادات Google Cloud", "err");
      else if (k === "youtube_err_norefresh") toast("لم يُمنح refresh token — أعد الموافقة مع جميع الصلاحيات", "err");
      else if (k === "youtube_err_channel") toast("تعذّر جلب القناة — تأكد من وجود قناة YouTube", "err");
      else if (k === "youtube_err_store") toast("تم الربط لكن فشل حفظ البيانات — تحقق من RLS", "err");
      else if (k.endsWith("_err")) toast("تعذّر إتمام الربط — تأكد من الموافقة على الصلاحيات", "err");
      else if (k !== "undefined") toast("تم الربط بنجاح 🎉");
      history.replaceState(null, "", location.pathname + "#/account");
    } else wrap.hidden = true;
  }

  /* ---------- قوالب البوستات ---------- */
  const TPL_KEY = "qr_post_templates";
  function loadTemplates() { try { return JSON.parse(localStorage.getItem(TPL_KEY) || "[]"); } catch { return []; } }
  function saveTemplates(t) { localStorage.setItem(TPL_KEY, JSON.stringify(t)); }
  function renderTemplates() {
    const wrap = $id("tplList"); if (!wrap) return;
    const tpls = loadTemplates();
    if (!tpls.length) { wrap.innerHTML = `<div class="hint">لا توجد قوالب بعد.</div>`; return; }
    wrap.innerHTML = tpls.map((t, i) => `<div class="qrow">
      <span class="qic">📝</span>
      <div class="qinfo"><b>${esc(t.name)}</b><small>${esc(t.title || "").slice(0, 60)}</small></div>
      <button class="btn btn-ghost btn-sm" data-del-tpl="${i}">🗑️</button>
    </div>`).join("");
    wrap.querySelectorAll("[data-del-tpl]").forEach(b => b.onclick = () => {
      const tpls = loadTemplates(); tpls.splice(parseInt(b.dataset.delTpl), 1); saveTemplates(tpls); renderTemplates(); toast("تم حذف القالب");
    });
  }
  function saveTemplate() {
    const name = prompt("اسم القالب:");
    if (!name) return;
    const tpls = loadTemplates();
    tpls.push({ name, title: $id("schedTitle")?.value || "", caption: $id("schedCaption")?.value || "", hashtags: $id("schedTags")?.value || "", created: Date.now() });
    saveTemplates(tpls); renderTemplates(); toast("تم حفظ القالب ✓");
  }

  /* ---------- إعدادات الإشعارات ---------- */
  const NOTIF_KEY = "qr_notif_settings";
  function loadNotif() { try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || "{}"); } catch { return {}; } }
  function saveNotif() {
    const s = { success: $id("notifSuccess")?.checked, fail: $id("notifFail")?.checked, daily: $id("notifDaily")?.checked };
    localStorage.setItem(NOTIF_KEY, JSON.stringify(s));
    toast("تم حفظ إعدادات الإشعارات ✓");
  }

  /* ---------- سجل النشاط ---------- */
  const ACT_KEY = "qr_activity_log";
  function logActivity(msg) {
    const log = JSON.parse(localStorage.getItem(ACT_KEY) || "[]");
    log.unshift({ msg, time: new Date().toISOString() });
    if (log.length > 50) log.length = 50;
    localStorage.setItem(ACT_KEY, JSON.stringify(log));
    renderActivity();
  }
  function renderActivity() {
    const wrap = $id("activityLog"); if (!wrap) return;
    const log = JSON.parse(localStorage.getItem(ACT_KEY) || "[]");
    if (!log.length) { wrap.innerHTML = `<div class="hint">لا توجد أنشطة بعد.</div>`; return; }
    wrap.innerHTML = log.map(e => {
      const d = new Date(e.time);
      const when = isNaN(d) ? "" : d.toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
      return `<div class="qrow"><span class="qic">📋</span><div class="qinfo"><b>${esc(e.msg)}</b><small>${when}</small></div></div>`;
    }).join("");
  }
  function clearActivity() { localStorage.removeItem(ACT_KEY); renderActivity(); toast("تم مسح السجل"); }

  /* ---------- تصدير/استيراد ---------- */
  function exportSettings() {
    const data = {
      templates: loadTemplates(),
      notifications: loadNotif(),
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "quran-reels-settings.json"; a.click();
    URL.revokeObjectURL(url);
    toast("تم تصدير الإعدادات ✓");
    logActivity("تصدير الإعدادات");
  }
  function importSettings(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.templates) saveTemplates(data.templates);
        if (data.notifications) localStorage.setItem(NOTIF_KEY, JSON.stringify(data.notifications));
        renderTemplates();
        toast("تم استيراد الإعدادات ✓");
        logActivity("استيراد الإعدادات");
      } catch { toast("ملف غير صالح", "err"); }
    };
    reader.readAsText(file);
  }
    /* ---------- تقويم المحتوى ---------- */
  let calDate = new Date();
  function renderCalendar() {
    const wrap = $id("contentCalendar"); if (!wrap) return;
    const y = calDate.getFullYear(), m = calDate.getMonth();
    const monthName = calDate.toLocaleString("ar-EG", { month: "long", year: "numeric" });
    const cm = $id("calMonth"); if (cm) cm.textContent = monthName;
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const startDay = first.getDay();
    const days = last.getDate();
    const postsByDay = {};
    for (const r of queue) {
      const d = new Date(r.publish_at);
      if (d.getFullYear() === y && d.getMonth() === m) {
        const day = d.getDate();
        if (!postsByDay[day]) postsByDay[day] = [];
        postsByDay[day].push(r);
      }
    }
    const today = new Date();
    const heads = ["أحد", "إثن", "ثلا", "أرب", "خمس", "جمع", "سبت"];
    let html = heads.map(h => `<div class="cal-head">${h}</div>`).join("");
    for (let i = 0; i < startDay; i++) html += `<div class="cal-day"></div>`;
    for (let d = 1; d <= days; d++) {
      const isToday = today.getFullYear() === y && today.getMonth() === m && today.getDate() === d;
      const hasPost = postsByDay[d];
      html += `<div class="cal-day${hasPost ? " has-post" : ""}${isToday ? " today" : ""}" title="${hasPost ? hasPost.length + " منشور" : ""}">${d}${hasPost ? `<br><small>${hasPost.length}</small>` : ""}</div>`;
    }
    wrap.innerHTML = html;
  }

  /* ---------- مكتبة الفيديو ---------- */
  async function renderVideoLibrary() {
    const wrap = $id("videoLibrary"); if (!wrap) return;
    const u = QRAuth.user(); if (!u) { wrap.innerHTML = `<div class="hint">سجّل الدخول لعرض الفيديوهات.</div>`; return; }
    try {
      const t = await QRAuth.token();
      const c = await QRAuth.conf();
      const r = await fetch(`${c.url}/storage/v1/object/list/reels`, {
        method: "POST", headers: { apikey: c.anonKey || "", Authorization: "Bearer " + t, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: u.id + "/", limit: 50, sortBy: { column: "created_at", order: "desc" } })
      });
      const files = await r.json();
      if (!Array.isArray(files) || !files.length) { wrap.innerHTML = `<div class="hint">لا توجد فيديوهات بعد.</div>`; return; }
      wrap.innerHTML = files.map(f => {
        const name = f.name || f.id || "";
        const size = f.metadata?.size ? (f.metadata.size / 1024 / 1024).toFixed(1) + " MB" : "";
        const url = `${c.url}/storage/v1/object/public/reels/${u.id}/${name}`;
        return `<div class="qrow">
          <span class="qic">🎬</span>
          <div class="qinfo"><b>${esc(name)}</b><small>${size}</small></div>
          <a class="btn btn-ghost btn-sm" href="${url}" target="_blank" download>⬇️</a>
        </div>`;
      }).join("");
    } catch { wrap.innerHTML = `<div class="hint">تعذّر تحميل المكتبة.</div>`; }
  }
    async function refreshAccount() {
    renderNotice();
    renderAuthCard();
    const u = QRAuth.user();
    if (u) { await loadConnections(); await loadQueue(); }
    renderChannels(); renderQueue(); renderAuto(); renderRuns();
    renderStats(); renderTemplates(); renderActivity();
    renderCalendar(); renderVideoLibrary();
    // تحميل إعدادات الإشعارات
    const ns2 = loadNotif();
    const n1 = $id("notifSuccess"); if (n1 && ns2.success !== undefined) n1.checked = ns2.success;
    const n2 = $id("notifFail"); if (n2 && ns2.fail !== undefined) n2.checked = ns2.fail;
    const n3 = $id("notifDaily"); if (n3 && ns2.daily !== undefined) n3.checked = ns2.daily;
    // بطاقة المهمة الجديدة
    const ns = $id("btnNewSched");
    if (ns) ns.onclick = () => $id("schedFile").click();
    const br = $id("btnRefreshRuns");
    if (br) br.onclick = () => renderRuns();
    const ba = $id("btnRefreshAcct");
    if (ba) ba.onclick = () => refreshAccount();
    // تقويم
    const bp = $id("btnPrevMonth"); if (bp) bp.onclick = () => { calDate.setMonth(calDate.getMonth() - 1); renderCalendar(); };
    const bn = $id("btnNextMonth"); if (bn) bn.onclick = () => { calDate.setMonth(calDate.getMonth() + 1); renderCalendar(); };
    // مكتبة
    const brl = $id("btnRefreshLib"); if (brl) brl.onclick = () => renderVideoLibrary();
    // قوالب
    const bst = $id("btnSaveTpl"); if (bst) bst.onclick = saveTemplate;
    // إشعارات
    const bsn = $id("btnSaveNotif"); if (bsn) bsn.onclick = saveNotif;
    // سجل نشاط
    const bca = $id("btnClearActivity"); if (bca) bca.onclick = () => { if (confirm("مسح السجل؟")) clearActivity(); };
    // تصدير/استيراد
    const be = $id("btnExport"); if (be) be.onclick = exportSettings;
    const bi = $id("btnImport"); if (bi) bi.onclick = () => $id("importFile").click();
    const fi = $id("importFile"); if (fi) fi.onchange = () => { if (fi.files?.[0]) importSettings(fi.files[0]); fi.value = ""; };
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

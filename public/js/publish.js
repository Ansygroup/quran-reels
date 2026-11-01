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
  let conns = [], queue = [], connectionsError = "", queueError = "", connectionsLoading = false, queueLoading = false, schedBlob = null, schedPath = "", schedName = "";
  let dashboard = { config: null, channels: [], runs: [], reciters: [] }, dashboardError = "", dashboardLoading = false, refreshSequence = 0, dashboardOwner = "", historyPollTimer = null, runSearch = "", runStatusFilter = "all";

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
    const owner = QRAuth.user()?.id || "";
    try {
      const token = await QRAuth.token();
      if (QRAuth.user()?.id !== owner) return;
      if (!token) { conns = []; connectionsError = "انتهت جلسة الدخول؛ سجّل الدخول مجددًا."; return; }
      const response = await fetch("/api/social?op=list", { headers: { Authorization: "Bearer " + token } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "تعذّر تحميل القنوات");
      if (QRAuth.user()?.id === owner) { conns = Array.isArray(result.connections) ? result.connections : []; connectionsError = ""; }
    } catch (error) { if (QRAuth.user()?.id === owner) { conns = []; connectionsError = String(error.message || error); } }
  }
  async function loadQueue() {
    const owner = QRAuth.user()?.id || "";
    try {
      if (!owner) { queue = []; queueError = ""; return; }
      const rows = await sb(`/rest/v1/publish_queue?user_id=eq.${encodeURIComponent(owner)}&order=publish_at.desc&limit=100`);
      if (QRAuth.user()?.id === owner) { queue = Array.isArray(rows) ? rows : []; queueError = ""; }
    } catch (error) { if (QRAuth.user()?.id === owner) { queue = []; queueError = String(error.message || error); } }
  }
  async function accountApi(action = "", body = null) {
    const token = await QRAuth.token();
    if (!token) throw new Error("سجّل الدخول أولًا");
    const options = { headers: { Authorization: "Bearer " + token } };
    if (action) {
      options.method = "POST";
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify({ action, ...(body || {}) });
    }
    const response = await fetch("/api/autopilot", options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `تعذّر تحميل الحساب (${response.status})`);
    return result;
  }
  async function loadAutoHistory() {
    const owner = QRAuth.user()?.id || "";
    if (!owner) {
      dashboard = { config: null, channels: [], runs: [], reciters: [] };
      dashboardError = "";
      return dashboard;
    }
    try {
      const result = await accountApi();
      if (QRAuth.user()?.id !== owner) return dashboard;
      dashboard = result;
      dashboard.config = dashboard.config || { enabled: false, daily_count: 1, youtube_connection_ids: [], template: { content_mode: "mix", background: "rotate" } };
      dashboard.channels = Array.isArray(dashboard.channels) ? dashboard.channels : [];
      dashboard.runs = Array.isArray(dashboard.runs) ? dashboard.runs : [];
      dashboardError = "";
    } catch (error) {
      if (QRAuth.user()?.id !== owner) return dashboard;
      dashboardError = String(error.message || error);
      // Unknown is not the same as disabled: never render editable defaults after a failed read.
      dashboard = { config: null, channels: [], runs: [], reciters: [] };
    }
    return dashboard;
  }
  async function saveAutoSettings(settings) {
    const result = await accountApi("save", settings);
    dashboard.config = result.config || dashboard.config;
    return result;
  }

  function youtubeVideoId(value) {
    try {
      const u = new URL(String(value || ""));
      if (u.protocol !== "https:") return "";
      const host = u.hostname.toLowerCase().replace(/^www\./, "");
      let id = "";
      if (host === "youtu.be") id = u.pathname.split("/").filter(Boolean)[0] || "";
      else if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
        if (u.pathname === "/watch") id = u.searchParams.get("v") || "";
        else id = u.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})(?:\b|$)/)?.[1] || "";
      }
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
    } catch { return ""; }
  }
  function safeExternalUrl(value) {
    try {
      const u = new URL(String(value || ""));
      const host = u.hostname.toLowerCase().replace(/^www\./, "");
      const allowed = ["youtube.com", "youtu.be", "youtube-nocookie.com", "facebook.com", "instagram.com", "tiktok.com", "x.com", "twitter.com"];
      return u.protocol === "https:" && allowed.includes(host) ? u.href : "";
    } catch { return ""; }
  }

  function cairoDateTime(value, options = { dateStyle: "medium", timeStyle: "short" }) {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ar-EG", { timeZone: "Africa/Cairo", ...options });
  }

  /* ---------- الرسم ---------- */
  function statusBadge(r) {
    const map = {
      scheduled: ["🕐 مجدولة", "sch"], publishing: ["⏳ تُنشر…", "sch"],
      published: ["✅ منشورة", "ok"], failed: ["⚠️ فشلت", "err"], draft: ["✏️ مسودة", "sch"],
    };
    const [txt, cls] = map[r.status] || [r.status, "sch"];
    return `<span class="qbadge ${cls}">${esc(txt)}</span>`;
  }

  function renderChannels() {
    const wrap = $id("acctChannels"); if (!wrap) return;
    const youtube = conns.filter(x => x.platform === "youtube");
    const controlsDisabled = connectionsError || connectionsLoading ? "disabled" : "";
    const cards = [];
    const ytRows = youtube.length ? youtube.map(c => `
      <div class="chan-account-row">
        <span class="chan-avatar">▶</span><div class="chan-info"><b>${esc(c.account_name || "قناة YouTube")}</b><small class="ok">مرتبطة عبر Google · YouTube</small></div>
        <button class="btn btn-ghost btn-sm" type="button" data-disc="${esc(c.id)}" aria-label="فك ربط ${esc(c.account_name || "القناة")}" ${controlsDisabled}>فك الربط</button>
      </div>`).join("") : `<div class="acct-empty compact"><span>🔗</span><div><b>لا توجد قناة مرتبطة بعد</b><p>اربط قناة YouTube للجدولة أو الأتمتة.</p></div></div>`;
    cards.push(`<article class="chan-card youtube-card ${youtube.length ? "on" : ""}">
      <div class="chan-card-head"><div class="chan-ic">🎬</div><div class="chan-info"><b>YouTube</b><small class="${youtube.length ? "ok" : ""}">${youtube.length ? `${youtube.length} قناة مرتبطة` : "غير مرتبط"}</small></div><button class="btn btn-em btn-sm" type="button" data-conn="youtube" ${controlsDisabled}>${youtube.length ? "＋ إضافة قناة" : "اربط قناة"}</button></div>
      <div class="chan-account-list">${ytRows}</div>
      <p class="chan-help">يمكن ربط أكثر من قناة Google؛ لن نعرض رموز الوصول أو كلمات المرور.</p>
    </article>`);
    for (const [key, platform] of Object.entries(PLATFORMS)) {
      if (key === "youtube") continue;
      const list = conns.filter(x => x.platform === key);
      const first = list[0];
      const igAttached = key === "instagram" && !first && conns.some(x => x.platform === "facebook" && x.extra?.ig);
      const label = key === "facebook" ? "فيسبوك" : platform.name;
      cards.push(`<article class="chan-card ${first ? "on" : ""}">
        <div class="chan-card-head"><div class="chan-ic">${platform.icon}</div><div class="chan-info"><b>${label}</b><small class="${first ? "ok" : ""}">${first ? `✓ ${esc(first.account_name || "مرتبطة")}` : (igAttached ? "متاح عبر ربط فيسبوك" : "غير مرتبطة")}</small></div>
        ${first ? `<button class="btn btn-ghost btn-sm" type="button" data-disc="${esc(first.id)}" ${controlsDisabled}>فك الربط</button>` : `<button class="btn btn-em btn-sm" type="button" data-conn="${key}" ${controlsDisabled}>اربط</button>`}</div>
      </article>`);
    }
    const connectionNotice = connectionsLoading
      ? `<div class="acct-data-alert" role="status">جارٍ التحقق من القنوات قبل إتاحة الربط أو فكّه…</div>`
      : (connectionsError ? `<div class="acct-data-alert" role="alert">تعذّر تحميل حالة القنوات: ${esc(connectionsError)}. أوقفنا الربط/الفك مؤقتًا حتى لا نعرض حالة قديمة أو ننشئ ربطًا مكررًا. <button class="btn btn-ghost btn-sm" type="button" id="acctConnectionsRetry">إعادة المحاولة</button></div>` : "");
    wrap.innerHTML = connectionNotice + cards.join("");
    $id("acctConnectionsRetry")?.addEventListener("click", () => refreshAccount());
    wrap.querySelectorAll("[data-conn]").forEach(button => button.onclick = async () => {
      if (connectionsError) return;
      const key = button.dataset.conn;
      const token = await QRAuth.token();
      if (!token) { openLogin(); return; }
      const platform = key === "facebook" ? "meta" : key;
      location.href = `/api/oauth?op=start&p=${platform}&t=${encodeURIComponent(token)}`;
    });
    wrap.querySelectorAll("[data-disc]").forEach(button => button.onclick = async () => {
      if (connectionsError) return;
      if (!window.confirm("سيُفك ربط هذه القناة، وقد يتوقف النشر المجدول إليها. هل تريد المتابعة؟")) return;
      const token = await QRAuth.token();
      try {
        const response = await fetch("/api/social?op=disconnect", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ id: button.dataset.disc }) });
        if (!response.ok) throw new Error("تعذّر فك الربط");
        toast("تم فك ربط القناة");
        await refreshAccount();
      } catch (error) { toast(error.message || "تعذّر فك الربط", "err"); }
    });
  }

  function renderQueue() {
    const wrap = $id("acctQueue"); if (!wrap) return;
    if (!QRAuth.user()) {
      wrap.innerHTML = `<div class="acct-empty"><span>🔒</span><div><b>جدولك خاص بك</b><p>سجّل الدخول لعرض مهام النشر أو إضافة فيديو جديد.</p><button class="btn btn-em btn-sm" type="button" id="acctQueueLogin">تسجيل الدخول</button></div></div>`;
      $id("acctQueueLogin")?.addEventListener("click", openLogin);
      return;
    }
    if (queueLoading) {
      wrap.innerHTML = `<div class="acct-empty compact" role="status"><span>📡</span><div><b>جارٍ تحميل مهامك</b><p>نتحقق من جدول النشر قبل عرضه.</p></div></div>`;
      return;
    }
    if (queueError) {
      wrap.innerHTML = `<div class="acct-empty error"><span>⚠️</span><div><b>تعذّر تحميل مهام الجدولة</b><p>${esc(queueError)} — لا نفترض أن جدولك فارغًا.</p><button class="btn btn-ghost btn-sm" type="button" id="acctQueueRetry">إعادة المحاولة</button></div></div>`;
      $id("acctQueueRetry")?.addEventListener("click", () => refreshAccount());
      return;
    }
    if (!queue.length) { wrap.innerHTML = `<div class="acct-empty compact"><span>🗓️</span><div><b>لا توجد مهام مجدولة بعد</b><p>أنشئ فيديو أو ارفع ملفًا، ثم اختر القناة ووقت النشر.</p><a class="btn btn-ghost btn-sm" href="#/" style="margin-top:8px">ابدأ بإنشاء فيديو</a></div></div>`; return; }
    wrap.innerHTML = queue.map(r => {
      const p = PLATFORMS[r.platform] || { name: r.platform, icon: "•" };
      const d = new Date(r.publish_at);
      const when = cairoDateTime(d);
      const canAct = r.status === "scheduled" || r.status === "failed";
      return `<div class="qrow">
        <span class="qic">${p.icon}</span>
        <div class="qinfo">
          <b>${esc(r.title || "ريلز")}</b>
          <small>${esc(p.name)} · ${esc(when)} القاهرة${r.error ? ` · <i class="qerr">${esc(r.error.slice(0, 90))}</i>` : ""}${safeExternalUrl(r.external_url) ? ` · <a href="${esc(safeExternalUrl(r.external_url))}" target="_blank" rel="noopener noreferrer">فتح ↗</a>` : ""}</small>
        </div>
        ${statusBadge(r)}
        <div class="qacts">
          ${canAct ? `<button class="btn btn-gold btn-sm" data-pub="${r.id}">انشر الآن</button>` : ""}
          <button class="btn btn-ghost btn-sm" data-del="${r.id}">حذف</button>
        </div>
      </div>`;
    }).join("");
    wrap.querySelectorAll("[data-pub]").forEach(b => b.onclick = () => publishNow(b.dataset.pub, b));
    wrap.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
      if (!window.confirm("هل تريد حذف مهمة النشر هذه؟ لا يمكن التراجع عن الحذف.")) return;
      const u = QRAuth.user(); if (!u) return openLogin();
      b.disabled = true;
      try {
        await sb(`/rest/v1/publish_queue?id=eq.${encodeURIComponent(b.dataset.del)}&user_id=eq.${encodeURIComponent(u.id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
        toast("حُذفت المهمة");
        await refreshAccount();
      } catch (error) { b.disabled = false; toast(error.message || "تعذّر حذف المهمة", "err"); }
    });
  }

  async function publishNow(id, btn) {
    if (!window.confirm(`سيُنشر هذا الفيديو على المنصة المختارة الآن علنًا. هل تريد المتابعة؟`)) return;
    if (btn) { btn.disabled = true; btn.textContent = "…"; }
    try {
      const t = await QRAuth.token();
      const r = await fetch("/api/publish", { method: "POST", headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: JSON.stringify({ queue_id: id }) });
      const j = await r.json().catch(() => ({}));
      if (j.ok) toast("تم النشر بنجاح 🎉"); else toast(j.error || "تعذّر النشر — راجع ربط المنصة", "err");
    } catch (e) { toast(String(e.message || e), "err"); }
    refreshAccount();
  }

  function renderAccountStats() {
    const wrap = $id("acctStats"); if (!wrap) return;
    if (dashboardError) {
      wrap.hidden = false;
      wrap.innerHTML = `<div class="acct-data-alert" role="alert">تعذّر تحميل سجل الحساب؛ لا نعرض أرقامًا توحي بأن سجلّك فارغ.</div>`;
      return;
    }
    const runs = Array.isArray(dashboard.runs) ? dashboard.runs : [];
    const published = runs.filter(x => x.status === "published").length;
    const failed = runs.filter(x => x.status === "failed").length;
    const channels = (Array.isArray(dashboard.channels) ? dashboard.channels.length : 0) || conns.filter(x => x.platform === "youtube").length;
    wrap.hidden = false;
    wrap.innerHTML = `
      <div class="acct-stat"><span>قنوات مرتبطة</span><b>${channels}</b></div>
      <div class="acct-stat"><span>فيديوهات منشورة في السجل</span><b>${published}</b></div>
      <div class="acct-stat"><span>فيديوهات في السجل</span><b>${runs.length}</b></div>
      <div class="acct-stat"><span>مهام تعذّر إكمالها</span><b>${failed}</b></div>`;
  }

  function dashboardPurpose(row) {
    const caption = String(row.caption || "");
    if (caption.includes("إهداء محبة")) return "إهداء";
    if (caption.includes("صدقة جارية")) return "صدقة جارية";
    if (caption.includes("تذكير هادئ")) return "تذكير قرآني";
    if (caption.includes("اللهم اجعل القرآن")) return "دعاء";
    return row.boardType === "automatic" ? "آيات قرآنية" : "نشر مجدول";
  }

  function dashboardItems() {
    const linkedQueue = Array.isArray(queue) ? queue : [];
    const runs = Array.isArray(dashboard.runs) ? dashboard.runs : [];
    const seen = new Set();
    const items = runs.map(run => {
      const queueRow = linkedQueue.find(row => String(row.id) === String(run.publish_queue_id));
      if (queueRow) seen.add(String(queueRow.id));
      return { ...(queueRow || {}), ...run, boardType: "automatic", queueRow };
    });
    for (const row of linkedQueue) if (!seen.has(String(row.id))) items.push({ ...row, boardType: "scheduled", queueRow: row });
    return items;
  }

  function dashboardColumn(item) {
    const status = String(item.status || item.queue_status || "").toLowerCase();
    const queueStatus = String(item.queueRow?.status || "").toLowerCase();
    if (status === "failed" || queueStatus === "failed") return "failed";
    if (status === "published" || queueStatus === "published") return "published";
    if (["rendering", "preparing", "storing", "publishing", "processing", "in_progress"].includes(status)) return "working";
    return "queued";
  }

  function renderUpcomingSchedule() {
    const wrap = $id("acctUpcoming"); if (!wrap) return;
    if (!QRAuth.user()) {
      wrap.innerHTML = `<div class="acct-upcoming-empty">سجّل الدخول لعرض معاينة جدول الأتمتة والموعد القادم.</div>`;
      return;
    }
    if (dashboardLoading) {
      wrap.innerHTML = `<div class="acct-upcoming-empty" role="status">جارٍ تحميل موعد النشر والمقاطع المتوقعة من إعدادات حسابك…</div>`;
      return;
    }
    if (dashboardError) {
      wrap.innerHTML = `<div class="acct-upcoming-empty" role="alert">تعذّر حساب المعاينة الآن؛ أعد تحميل لوحة الحساب قبل الاعتماد على المواعيد.</div>`;
      return;
    }
    if (dashboard.config?.enabled !== true) {
      wrap.innerHTML = `<div class="acct-upcoming-head"><div><span class="acct-kicker">الموعد القادم</span><h3 id="acctUpcomingTitle">معاينة فيديوهات الأتمتة</h3><p>الأتمتة متوقفة حاليًا؛ لن يُنشأ أو يُنشر فيديو تلقائيًا.</p></div></div>`;
      return;
    }
    if (dashboard.upcomingError) {
      wrap.innerHTML = `<div class="acct-upcoming-empty" role="alert">${esc(dashboard.upcomingError)}</div>`;
      return;
    }
    const upcoming = Array.isArray(dashboard.upcoming) ? dashboard.upcoming : [];
    if (!upcoming.length) {
      wrap.innerHTML = `<div class="acct-upcoming-head"><div><span class="acct-kicker">الموعد القادم</span><h3 id="acctUpcomingTitle">لا توجد فيديوهات مهيأة للدفعة القادمة</h3><p>تحقّق من القنوات المختارة وحالة ربطها في إعدادات الأتمتة.</p></div></div>`;
      return;
    }
    const slot = new Date(upcoming[0].publish_at);
    const cairoTime = Number.isNaN(slot.getTime()) ? "04:15 UTC" : slot.toLocaleString("ar-EG", { timeZone: "Africa/Cairo", weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
    const utcTime = Number.isNaN(slot.getTime()) ? "04:15" : slot.toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false });
    const styles = { card: "بطاقة آيات", word: "كلمة بكلمة", rotate: "تدوير الأشكال" };
    const backgrounds = { rotate: "خلفية متناوبة", "bg-mosque-night": "مسجد ليلي", "bg-starry-desert": "صحراء ليلية", "bg-ocean-sunset": "غروب البحر", "bg-forest-rays": "أشعة الغابة", "bg-geometric-islamic": "زخرفة إسلامية", "bg-mountains-dawn": "فجر وجبال", "bg-mosque-silhouette": "ظلال مسجد", "bg-garden-tulips": "حديقة", "bg-arabesque-dark": "أرابيسك داكن", "bg-heavenly-clouds": "غيوم هادئة", "grad-emerald": "زمردي", "grad-gold": "ذهبي", "grad-dawn": "الفجر", "grad-night": "ليلي" };
    const purposes = { general: "عام", gift: "إهداء", sadaqah: "صدقة جارية", reminder: "تذكير", dua: "دعاء" };
    wrap.innerHTML = `
      <div class="acct-upcoming-head">
        <div><span class="acct-kicker">الدفعة القادمة · ${upcoming.length} ${upcoming.length === 1 ? "فيديو" : "فيديوهات"}</span><h3 id="acctUpcomingTitle">ماذا سيُنشر ومتى؟</h3><p>الوقت المتوقع لبدء إنشاء ونشر الدفعة بالتوقيت المحلي في القاهرة.</p></div>
        <div class="acct-upcoming-time"><small>موعد بدء الدفعة</small><b>${esc(cairoTime)}</b><small>${esc(utcTime)} UTC</small></div>
      </div>
      <div class="acct-upcoming-list">${upcoming.map(item => `<article class="acct-upcoming-card">
        <span>الفيديو ${Number(item.daily_index) || 1} من ${Number(item.daily_total) || upcoming.length}</span>
        <h4>${esc(item.title || "فيديو قرآني متوقع")}</h4>
        <p>📖 السورة ${esc(item.surah_number)} · الآيات ${esc(item.from_ayah)}–${esc(item.to_ayah)}</p>
        <p>🎙️ ${esc(item.reciter || "قارئ متناوب")} · 📺 ${esc(item.channel_name || "القناة المختارة")}</p>
        <p>🎨 ${esc(styles[item.video_style] || item.video_style || "شكل تلقائي")} · 🖼️ ${esc(backgrounds[item.background] || item.background || "خلفية تلقائية")}</p>
        <p>النية: ${esc(purposes[item.purpose] || item.purpose || "عام")}</p>
      </article>`).join("")}</div>
      <p class="acct-upcoming-note">هذه معاينة محسوبة من الإعدادات المحفوظة وليست فيديوهات جاهزة أو محجوزة؛ تُنشأ الفيديوهات عند تشغيل المجدول وقد تتغير المعاينة إذا عُدّلت الإعدادات قبل الموعد. يبدأ النظام الدفعة عند الموعد ثم يُنشئ الفيديوهات وينشرها بالتتابع، لذلك لا يوجد وقت انتهاء منفصل مضمون لكل فيديو.</p>`;
  }

  function renderDashboard() {
    renderUpcomingSchedule();
    const stats = $id("acctDashStats"), board = $id("acctKanban");
    if (!stats || !board) return;
    if (!QRAuth.user()) {
      stats.innerHTML = "";
      board.innerHTML = `<div class="acct-empty"><span>🔒</span><div><b>لوحتك خاصة بحسابك</b><p>سجّل الدخول لتشاهد المقاطع المجدولة والآلية وحالات نشرها.</p><button class="btn btn-em btn-sm" type="button" id="acctBoardLogin">تسجيل الدخول</button></div></div>`;
      $id("acctBoardLogin")?.addEventListener("click", openLogin);
      return;
    }
    if (dashboardError) {
      stats.innerHTML = `<div class="acct-data-alert" role="alert">تعذّر تحميل حالة الأتمتة؛ لا نعرض أرقامًا أو حالة قد تكون غير صحيحة.</div>`;
      board.innerHTML = `<div class="acct-empty error"><span>⚠️</span><div><b>لم نتمكن من تحميل لوحة النشر</b><p>${esc(dashboardError)}</p><button class="btn btn-ghost btn-sm" type="button" id="acctBoardRetry">إعادة المحاولة</button></div></div>`;
      $id("acctBoardRetry")?.addEventListener("click", () => refreshAccount());
      return;
    }
    const items = dashboardItems();
    const enabled = dashboard.config?.enabled === true;
    const planned = items.filter(item => ["queued", "working"].includes(dashboardColumn(item))).length;
    const published = items.filter(item => dashboardColumn(item) === "published").length;
    const failed = items.filter(item => dashboardColumn(item) === "failed").length;
    const channels = Array.isArray(dashboard.channels) ? dashboard.channels : [];
    const dailyCount = Math.max(1, Math.min(3, Number(dashboard.config?.daily_count) || 1));
    stats.innerHTML = `
      <div class="acct-dash-stat ${enabled ? "is-on" : ""}"><span>حالة التشغيل</span><b>${enabled ? "● يعمل" : "○ متوقف"}</b><small>${enabled ? `${dailyCount} فيديو/يوم` : "فعّله من إعدادات الأتمتة"}</small></div>
      <div class="acct-dash-stat"><span>بانتظار النشر</span><b>${planned}</b><small>مجدول أو قيد الإنشاء</small></div>
      <div class="acct-dash-stat"><span>تم النشر</span><b>${published}</b><small>ضمن العناصر المعروضة</small></div>
      <div class="acct-dash-stat ${failed ? "has-errors" : ""}"><span>تحتاج متابعة</span><b>${failed}</b><small>${channels.length} قناة مرتبطة</small></div>`;
    const columns = [
      ["working", "قيد الإنشاء", "⚙️"], ["queued", "بانتظار النشر", "🗓️"], ["published", "منشور", "✅"], ["failed", "تعذّر / يحتاج متابعة", "⚠️"],
    ];
    const errorBanner = queueError ? `<div class="acct-data-alert" role="status">تعذّر تحميل مهام الجدولة؛ قد تكون بعض البطاقات غير ظاهرة. ${esc(queueError)}</div>` : "";
    board.innerHTML = errorBanner + columns.map(([key, label, icon]) => {
      const cards = items.filter(item => dashboardColumn(item) === key).sort((a, b) => new Date(b.publish_at || b.created_at || 0) - new Date(a.publish_at || a.created_at || 0));
      return `<section class="kanban-column kanban-${key}" aria-label="${label}">
        <header><span>${icon} ${label}</span><b>${cards.length}</b></header>
        <div class="kanban-cards">${cards.length ? cards.map(item => {
          const title = String(item.title || "فيديو قرآني");
          const channel = item.channel_name || channels.find(c => String(c.id) === String(item.social_connection_id || item.youtube_connection_id))?.account_name || "القناة المحددة";
          const whenValue = item.publish_at || item.completed_at || item.created_at;
          const date = whenValue ? new Date(whenValue) : null;
          const when = date && !Number.isNaN(date.getTime()) ? cairoDateTime(date) : "موعده حسب الجدول";
          const link = safeExternalUrl(item.external_url);
          const kind = dashboardPurpose(item);
          return `<article class="kanban-card">
            <div class="kanban-card-top"><span>${item.boardType === "automatic" ? "أتمتة" : "جدولة"}</span><small>${esc(kind)}</small></div>
            <h4>${esc(title)}</h4>
            <p>📺 ${esc(channel)}</p><p>🕒 ${esc(when)} · القاهرة</p>
            ${item.error ? `<p class="kanban-error">${esc(String(item.error).slice(0, 120))}</p>` : ""}
            ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">فتح الفيديو ↗</a>` : ""}
            ${item.status === "failed" && item.queue_status === "failed" && item.publish_queue_id ? `<button class="btn btn-gold btn-sm" type="button" data-kanban-pub="${esc(item.publish_queue_id)}">إعادة محاولة النشر</button>` : ""}
          </article>`;
        }).join("") : `<div class="kanban-empty">لا توجد عناصر هنا الآن</div>`}</div>
      </section>`;
    }).join("");
    board.querySelectorAll("[data-kanban-pub]").forEach(button => button.onclick = () => publishNow(button.dataset.kanbanPub, button));
  }

  function renderQuickActions() {
    const wrap = $id("acctQuickActions"); if (!wrap) return;
    if (!QRAuth.user()) { wrap.hidden = true; wrap.innerHTML = ""; return; }
    wrap.hidden = false;
    wrap.innerHTML = `<a class="btn btn-em" href="#/">🎬 إنشاء فيديو</a><button class="btn btn-ghost" type="button" id="acctQuickSchedule">＋ جدولة ملف فيديو</button><button class="btn btn-ghost" type="button" id="acctQuickRefresh">↻ تحديث الحساب</button>`;
    $id("acctQuickSchedule").onclick = () => $id("schedFile")?.click();
    $id("acctQuickRefresh").onclick = () => refreshAccount();
  }

  function runStatus(run) {
    if (run.status === "published") return ["تم النشر", "ok"];
    if (run.status === "failed") return ["تعذّر الإكمال", "err"];
    if (run.status === "queued") return ["بانتظار النشر", "sch"];
    return ["قيد التنفيذ", "sch"];
  }
  function runSteps(run) {
    const order = ["preparing", "rendering", "storing", "publishing", "published"];
    const labels = { preparing: "التحضير", rendering: "إنشاء الفيديو", storing: "حفظه", publishing: "النشر", published: "اكتمل" };
    const current = run.status === "failed" ? order.indexOf(run.step) : order.indexOf(run.step || run.status);
    return `<ol class="acct-run-steps">${order.map((step, i) => {
      const state = run.status === "failed" && i === current ? "failed" : (i < current || run.status === "published" ? "done" : (i === current ? "current" : ""));
      return `<li class="${state}"><span>${state === "done" ? "✓" : i + 1}</span>${labels[step]}</li>`;
    }).join("")}</ol>`;
  }
  function renderAutoRuns() {
    const wrap = $id("acctRunList"); if (!wrap) return;
    const channelLabel = $id("acctRunChannel");
    const filters = $id("acctRunFilters"), searchInput = $id("acctRunSearch"), statusInput = $id("acctRunStatus"), countLabel = $id("acctRunCount");
    if (!QRAuth.user()) {
      if (filters) filters.hidden = true;
      if (channelLabel) channelLabel.textContent = "🔒 سجل خاص";
      wrap.innerHTML = `<div class="acct-empty"><span>🔐</span><div><b>سجّل الدخول لعرض سجلّك</b><p>لا يمكن لغيرك الاطلاع على فيديوهاتك أو تفاصيل قنواتك.</p><button class="btn btn-em btn-sm" type="button" id="acctHistoryLogin">تسجيل الدخول</button></div></div>`;
      $id("acctHistoryLogin")?.addEventListener("click", openLogin);
      return;
    }
    const runs = Array.isArray(dashboard.runs) ? dashboard.runs : [];
    if (channelLabel) channelLabel.textContent = `${dashboard.channels?.length || 0} قناة مرتبطة`;
    if (dashboardError) {
      if (filters) filters.hidden = true;
      wrap.innerHTML = `<div class="acct-empty error"><span>⚠️</span><div><b>تعذّر تحميل السجل</b><p>${esc(dashboardError)}</p><button class="btn btn-ghost btn-sm" type="button" id="acctRetryHistory">حاول مرة أخرى</button></div></div>`;
      $id("acctRetryHistory")?.addEventListener("click", () => refreshAccount());
      return;
    }
    if (!runs.length) {
      if (filters) filters.hidden = true;
      wrap.innerHTML = `<div class="acct-empty"><span>🌱</span><div><b>لا توجد فيديوهات آلية في السجل بعد</b><p>فعّل الأتمتة وحدد القنوات والعدد اليومي؛ سيظهر هنا كل فيديو وخطواته ورابطه.</p><a class="btn btn-ghost btn-sm" href="#/" style="margin-top:8px">أنشئ أول فيديو</a></div></div>`;
      return;
    }
    if (filters) filters.hidden = false;
    if (searchInput) { if (searchInput.value !== runSearch) searchInput.value = runSearch; searchInput.oninput = () => { runSearch = searchInput.value; renderAutoRuns(); }; }
    if (statusInput) { statusInput.value = runStatusFilter; statusInput.onchange = () => { runStatusFilter = statusInput.value; renderAutoRuns(); }; }
    const needle = runSearch.trim().toLocaleLowerCase();
    const filteredRuns = runs.filter(run => {
      const stateMatches = runStatusFilter === "all" || (runStatusFilter === "published" && run.status === "published") || (runStatusFilter === "failed" && run.status === "failed") || (runStatusFilter === "active" && !["published", "failed"].includes(run.status));
      const haystack = [run.title, run.channel_name, run.reciter, run.recipe_key, run.run_date].join(" ").toLocaleLowerCase();
      return stateMatches && (!needle || haystack.includes(needle));
    });
    if (countLabel) countLabel.textContent = `عرض ${filteredRuns.length.toLocaleString("ar-EG")} من ${runs.length.toLocaleString("ar-EG")}`;
    if (!filteredRuns.length) {
      wrap.innerHTML = `<div class="acct-empty compact"><span>🔎</span><div><b>لا توجد نتائج مطابقة</b><p>غيّر عبارة البحث أو اختر حالة أخرى.</p><button class="btn btn-ghost btn-sm" type="button" id="acctRunFiltersClear">مسح البحث والفلاتر</button></div></div>`;
      $id("acctRunFiltersClear")?.addEventListener("click", () => { runSearch = ""; runStatusFilter = "all"; renderAutoRuns(); });
      return;
    }
    wrap.innerHTML = filteredRuns.map(run => {
      const [statusText, statusClass] = runStatus(run);
      const videoId = youtubeVideoId(run.external_url);
      const publishedDate = run.completed_at || run.created_at;
      const parsedDate = publishedDate ? new Date(publishedDate) : null;
      const when = parsedDate && !Number.isNaN(parsedDate.getTime()) ? cairoDateTime(parsedDate) : "";
      const sequence = run.daily_total > 1 ? `الفيديو ${Number(run.daily_index) || 1} من ${Number(run.daily_total)}` : "فيديو اليوم";
      const link = safeExternalUrl(run.external_url);
      return `<article class="acct-run-card ${statusClass}">
        <div class="acct-run-top"><div><span class="acct-kicker">${esc(sequence)}${when ? ` · ${esc(when)}` : ""}</span><h3>${esc(run.title || "ريلز قرآنية")}</h3></div><span class="qbadge ${statusClass}">${statusText}</span></div>
        <div class="acct-run-meta"><span>📺 ${esc(run.channel_name || "قناة YouTube")}</span><span>🎙️ ${esc(run.reciter || "قارئ متناوب")}</span>${run.recipe_key ? `<span>📖 ${esc(run.recipe_key)}</span>` : ""}</div>
        ${runSteps(run)}
        ${run.error ? `<p class="acct-run-error">${esc(String(run.error).slice(0, 240))}</p>` : ""}
        ${videoId ? `<div class="acct-video-frame"><iframe src="https://www.youtube-nocookie.com/embed/${videoId}" title="${esc(run.title || "فيديو قرآني منشور")}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>` : ""}
        <div class="acct-run-actions">${link ? `<a class="btn btn-em btn-sm" href="${esc(link)}" target="_blank" rel="noopener noreferrer">▶ مشاهدة الفيديو</a>` : ""}${run.status === "failed" && run.queue_status === "failed" && run.publish_queue_id ? `<button class="btn btn-gold btn-sm" type="button" data-pub="${esc(run.publish_queue_id)}">إعادة محاولة النشر</button>` : ""}<button class="btn btn-ghost btn-sm" type="button" data-copy-title="${esc(run.title || "ريلز قرآنية")}">نسخ العنوان</button></div>
        ${(run.caption || run.hashtags) ? `<details class="acct-run-copy"><summary>الوصف والوسوم</summary>${run.caption ? `<p>${esc(run.caption)}</p><button class="btn btn-ghost btn-sm" type="button" data-copy-value="${esc(run.caption)}">نسخ الوصف</button>` : ""}${run.hashtags ? `<p class="acct-hashtags">${esc(run.hashtags)}</p><button class="btn btn-ghost btn-sm" type="button" data-copy-value="${esc(run.hashtags)}">نسخ الوسوم</button>` : ""}</details>` : ""}
      </article>`;
    }).join("");
    wrap.querySelectorAll("[data-pub]").forEach(button => button.onclick = () => publishNow(button.dataset.pub, button));
    wrap.querySelectorAll("[data-copy-title]").forEach(button => button.onclick = async () => {
      try { await navigator.clipboard.writeText(button.dataset.copyTitle); toast("نُسخ العنوان"); }
      catch { toast("تعذّر النسخ؛ حدّد العنوان يدويًا", "err"); }
    });
    wrap.querySelectorAll("[data-copy-value]").forEach(button => button.onclick = async () => {
      try { await navigator.clipboard.writeText(button.dataset.copyValue); toast("تم النسخ"); }
      catch { toast("تعذّر النسخ؛ حدّد النص يدويًا", "err"); }
    });
  }

  function syncHistoryPolling() {
    if (historyPollTimer) { clearTimeout(historyPollTimer); historyPollTimer = null; }
    const view = $id("view-account");
    const active = Array.isArray(dashboard.runs) && dashboard.runs.some(run => ["rendering", "queued"].includes(run.status));
    if (!view || view.hidden || document.hidden || !QRAuth.user() || !active) return;
    historyPollTimer = setTimeout(async () => {
      historyPollTimer = null;
      if ($id("view-account")?.hidden || document.hidden || !QRAuth.user()) return;
      await refreshAutoRuns();
    }, 20000);
  }

  async function refreshAutoRuns() {
    const button = $id("acctRunsRefresh");
    if (button) { button.disabled = true; button.textContent = "جارٍ التحديث…"; }
    try {
      await Promise.all([loadQueue(), loadAutoHistory()]);
      renderAccountStats();
      renderQueue();
      renderAutoRuns();
      renderDashboard();
      syncHistoryPolling();
    } finally {
      const current = $id("acctRunsRefresh");
      if (current) { current.disabled = false; current.textContent = "↻ تحديث السجل"; }
    }
  }

  function renderAuto() {
    const wrap = $id("acctAuto"); if (!wrap) return;
    if (!QRAuth.user()) {
      wrap.innerHTML = `<div class="acct-section-head"><div><span class="acct-kicker">تحكّم واضح وآمن</span><h2>إعدادات الأتمتة</h2></div><span class="acct-secure-badge">متوقفة افتراضيًا</span></div><p class="hint">سجّل الدخول لربط قنواتك واختيار عدد الفيديوهات ونمط المحتوى. لن يبدأ النشر الآلي دون تفعيلك.</p><button class="btn btn-em btn-sm" type="button" id="acctAutoLogin">تسجيل الدخول لإعداد الأتمتة</button>`;
      $id("acctAutoLogin")?.addEventListener("click", openLogin);
      return;
    }
    if (dashboardLoading) {
      wrap.innerHTML = `<div class="acct-section-head"><div><span class="acct-kicker">إعدادات الأتمتة</span><h2>جارٍ تحميل إعداداتك</h2></div><span class="acct-secure-badge">لحظة واحدة</span></div><div class="acct-empty compact" role="status"><span>📡</span><div><b>نقرأ الحالة الحالية قبل إتاحة التعديل</b><p>لن يُحفَظ أي تغيير حتى يكتمل تحميل إعدادات حسابك.</p></div></div>`;
      return;
    }
    if (dashboardError) {
      wrap.innerHTML = `<div class="acct-section-head"><div><span class="acct-kicker">إعدادات الأتمتة</span><h2>تعذّر تحميل إعداداتك</h2></div><span class="acct-secure-badge">الحالة غير معروفة</span></div><div class="acct-empty error"><span>🔒</span><div><b>لم نُجرِ أي تغيير على إعداداتك</b><p>${esc(dashboardError)} — أعد المحاولة قبل الحفظ لتفادي الكتابة فوق إعداداتك الحالية.</p><button class="btn btn-ghost btn-sm" type="button" id="acctAutoRetry">إعادة تحميل الإعدادات</button></div></div>`;
      $id("acctAutoRetry")?.addEventListener("click", () => refreshAccount());
      return;
    }
    const config = dashboard.config || { enabled: false, daily_count: 1, youtube_connection_ids: [], template: { content_mode: "mix", background: "rotate" } };
    const apiChannels = Array.isArray(dashboard.channels) ? dashboard.channels : [];
    const channels = apiChannels.length ? apiChannels : conns.filter(x => x.platform === "youtube");
    const template = config.template || {};
    const reciters = Array.isArray(dashboard.reciters) ? dashboard.reciters : [];
    const selectedReciter = template.reciter_mode === "fixed" ? String(template.reciter || "") : "rotate";
    let selected = Array.isArray(config.youtube_connection_ids) ? config.youtube_connection_ids.map(String) : [];
    if (config.enabled && !selected.length) selected = channels.map(x => String(x.id));
    const selectedSet = new Set(selected);
    const modes = [
      ["mix", "تنويع متوازن"], ["famous", "السور المشهورة"], ["sequential", "تسلسل مكتبة الفيديو"],
    ];
    const purposes = [["general", "عام ومتنوّع"], ["gift", "إهداء"], ["sadaqah", "صدقة جارية / مشاركة خيرية"], ["reminder", "تذكير وتدبّر"], ["dua", "دعاء" ]];
    const videoStyles = [["rotate", "تدوير تلقائي بين الأشكال"], ["card", "بطاقة آيات"], ["word", "كلمة بكلمة"]];
    const backgrounds = ["rotate", "bg-mosque-night", "bg-starry-desert", "bg-ocean-sunset", "bg-forest-rays", "bg-geometric-islamic", "bg-mountains-dawn", "bg-mosque-silhouette", "bg-garden-tulips", "bg-arabesque-dark", "bg-heavenly-clouds", "grad-emerald", "grad-gold", "grad-dawn", "grad-night"];
    const backgroundNames = { rotate: "تدوير الخلفيات تلقائيًا", "bg-mosque-night": "مسجد ليلي", "bg-starry-desert": "صحراء مرصعة بالنجوم", "bg-ocean-sunset": "غروب البحر", "bg-forest-rays": "أشعة الغابة", "bg-geometric-islamic": "زخرفة إسلامية", "bg-mountains-dawn": "الفجر والجبال", "bg-mosque-silhouette": "ظلال مسجد", "bg-garden-tulips": "حديقة", "bg-arabesque-dark": "أرابيسك داكن", "bg-heavenly-clouds": "غيوم هادئة", "grad-emerald": "تدرج زمردي", "grad-gold": "تدرج ذهبي", "grad-dawn": "تدرج الفجر", "grad-night": "تدرج ليلي" };
    wrap.innerHTML = `
      <div class="acct-section-head"><div><span class="acct-kicker">YouTube · نشر عام تلقائي</span><h2>إعدادات الأتمتة</h2></div><span class="acct-secure-badge ${config.enabled ? "is-on" : ""}">${config.enabled ? "● مفعّلة" : "○ متوقفة"}</span></div>
      <p class="hint">يبدأ المجدول قرابة <b>04:15 UTC</b> — أي 06:15 شتاءً و07:15 صيفًا بتوقيت القاهرة — وقد يتأخر بدء التشغيل حتى 59 دقيقة. يُنشر المحتوى علنًا دون مراجعة كل فيديو بعد تفعيلك للأتمتة.</p>
      <div class="auto-settings-grid">
        <label class="auto-field"><span>عدد الفيديوهات يوميًا</span><select id="autoDailyCount">${[1,2,3].map(n => `<option value="${n}" ${Number(config.daily_count || 1) === n ? "selected" : ""}>${n} ${n === 1 ? "فيديو" : "فيديوهات"}</option>`).join("")}</select></label>
        <label class="auto-field"><span>نمط المحتوى القرآني</span><select id="autoContentMode">${modes.map(([id, name]) => `<option value="${id}" ${template.content_mode === id ? "selected" : ""}>${name}</option>`).join("")}</select></label>
        <label class="auto-field"><span>قارئ التلاوة</span><select id="autoReciter"><option value="rotate" ${selectedReciter === "rotate" ? "selected" : ""}>تدوير تلقائي بين القرّاء</option>${reciters.map(reciter => `<option value="${esc(reciter.id)}" ${selectedReciter === String(reciter.id) ? "selected" : ""}>${esc(reciter.name)}</option>`).join("")}</select><small>اختيار قارئ يثبّته في القالب؛ الآيات تستمر بالتغيّر حسب نمط المحتوى.</small></label>
        <label class="auto-field"><span>شكل الفيديو</span><select id="autoVideoStyle">${videoStyles.map(([id, name]) => `<option value="${id}" ${(template.video_style || "rotate") === id ? "selected" : ""}>${name}</option>`).join("")}</select></label>
        <label class="auto-field"><span>الخلفية</span><select id="autoBackground">${backgrounds.map(id => `<option value="${id}" ${(template.background || "rotate") === id ? "selected" : ""}>${backgroundNames[id]}</option>`).join("")}</select></label>
        <label class="auto-field"><span>فكرة المقطع / نيّته</span><select id="autoPurpose">${purposes.map(([id, name]) => `<option value="${id}" ${(template.purpose || "general") === id ? "selected" : ""}>${name}</option>`).join("")}</select></label>
        <label class="auto-field auto-field-wide"><span>عبارة إضافية تكتب في وصف الفيديو (اختياري)</span><textarea id="autoCustomMessage" maxlength="180" rows="2" placeholder="مثال: إهداء إلى الوالدين — تقبّل الله">${esc(template.custom_message || "")}</textarea><small>تُضاف إلى الوصف فقط؛ لا تغيّر نص الآية أو عنوان السورة.</small></label>
      </div>
      <div class="auto-copy-preview"><b>معاينة الإضافة إلى الوصف</b><p id="autoCopyPreviewText" aria-live="polite"></p></div>
      <div class="auto-channel-box"><div class="auto-channel-head"><b>القنوات المستهدفة</b><small>يوزّع عدد الفيديوهات اليومي بالتناوب بين القنوات المحددة.</small></div>
        ${channels.length ? `<div class="auto-channel-options">${channels.map(c => `<label class="auto-channel"><input class="autoChannel" type="checkbox" value="${esc(c.id)}" ${selectedSet.has(String(c.id)) ? "checked" : ""}><span><b>${esc(c.account_name || "قناة YouTube")}</b><small>الخصوصية: عام</small></span></label>`).join("")}</div>` : `<div class="acct-empty compact"><span>📺</span><div><b>اربط قناة YouTube أولًا</b><p>يمكن إضافة أكثر من قناة من قسم «قنوات النشر».</p></div></div>`}
      </div>
      <div class="auto-enable-row"><label class="switch"><input type="checkbox" id="autoOn" aria-label="تفعيل النشر التلقائي" ${config.enabled ? "checked" : ""} ${channels.length || config.enabled ? "" : "disabled"}><i></i></label><div><b>تفعيل النشر التلقائي</b><small>متوقف افتراضيًا. لا تفعّله إلا إذا كنت تريد نشرًا عامًا بلا مراجعة لكل فيديو.</small></div></div>
      <div class="auto-action-row"><button class="btn btn-gold" id="autoSave" type="button">حفظ إعدادات الأتمتة</button><button class="btn btn-ghost" id="acctRunNow" type="button" ${channels.length ? "" : "disabled"}>إنشاء ونشر فيديو الآن</button></div>
      <p class="acct-inline-note">تتغيّر الآيات تلقائيًا؛ ويمكن تثبيت القارئ وشكل الفيديو والخلفية كقالب أو ترك أيٍّ منها للتدوير. المحتوى عام، ويمكنك إيقاف الأتمتة في أي وقت.</p>`;
    const copyPreview = $id("autoCopyPreviewText");
    const updateCopyPreview = () => {
      const canned = {
        general: "",
        gift: "📌 إهداء محبة وتذكير بكتاب الله.",
        sadaqah: "📌 مشاركة الآيات القرآنية بنية الأجر والصدقة الجارية؛ لا تتضمن هذه الرسالة طلب تبرعات مالية.",
        reminder: "📌 تذكير هادئ بالقرآن الكريم؛ دون إضافة تفسير غير موثّق للآيات.",
        dua: "📌 اللهم اجعل القرآن العظيم ربيع قلوبنا ونور صدورنا.",
      };
      const message = ($id("autoCustomMessage")?.value || "").normalize("NFC").trim();
      if (copyPreview) copyPreview.textContent = [canned[$id("autoPurpose")?.value] || "", message].filter(Boolean).join("\n\n") || "لن تُضاف عبارة إضافية؛ سيبقى وصف الآيات المُعدّ مسبقًا كما هو.";
    };
    $id("autoPurpose")?.addEventListener("change", updateCopyPreview);
    $id("autoCustomMessage")?.addEventListener("input", updateCopyPreview);
    updateCopyPreview();
    $id("autoSave").onclick = async () => {
      const enabled = $id("autoOn").checked;
      const youtube_connection_ids = [...document.querySelectorAll(".autoChannel:checked")].map(x => x.value);
      const count = Number($id("autoDailyCount").value);
      const mode = $id("autoContentMode").value;
      const purpose = $id("autoPurpose").value;
      const video_style = $id("autoVideoStyle").value;
      const selectedReciter = $id("autoReciter").value;
      const reciter_mode = selectedReciter === "rotate" ? "rotate" : "fixed";
      const reciter = reciter_mode === "fixed" ? selectedReciter : "";
      const custom_message = ($id("autoCustomMessage").value || "").normalize("NFC").trim().slice(0, 180);
      const background = $id("autoBackground").value;
      const channelsChanged = JSON.stringify([...youtube_connection_ids].sort()) !== JSON.stringify([...selected].sort());
      if (enabled && !youtube_connection_ids.length) return toast("اختر قناة واحدة على الأقل قبل التفعيل", "err");
      const settingsChanged = channelsChanged || count !== Number(config.daily_count || 1) || mode !== template.content_mode || purpose !== (template.purpose || "general") || video_style !== (template.video_style || "rotate") || reciter_mode !== (template.reciter_mode || "rotate") || reciter !== (template.reciter || "") || custom_message !== (template.custom_message || "") || background !== (template.background || "rotate");
      const needsConfirmation = enabled && (!config.enabled || settingsChanged);
      if (needsConfirmation && !window.confirm(`ستُنشر الفيديوهات علنًا إلى القنوات المحددة بمعدل ${count} يوميًا، دون مراجعة كل فيديو. هل توافق على تطبيق هذه الإعدادات؟`)) {
        $id("autoOn").checked = !!config.enabled;
        document.querySelectorAll(".autoChannel").forEach(x => { x.checked = selectedSet.has(String(x.value)); });
        return;
      }
      const button = $id("autoSave"); if (button) { button.disabled = true; button.textContent = "جارٍ الحفظ…"; }
      try {
        await saveAutoSettings({ enabled, daily_count: count, youtube_connection_ids, template: { content_mode: mode, purpose, custom_message, video_style, background, reciter_mode, reciter, privacy: "public" } });
        toast(enabled ? "حُفظت الإعدادات — النشر التلقائي مفعّل" : "حُفظت الإعدادات؛ الأتمتة متوقفة");
        await refreshAccount();
      } catch (error) { toast(error.message || "تعذّر حفظ الإعدادات", "err"); if (button) { button.disabled = false; button.textContent = "حفظ إعدادات الأتمتة"; } }
    };
    $id("acctRunNow").onclick = async buttonEvent => {
      if (!window.confirm("سيُنشأ فيديو قرآني ويُنشر علنًا الآن على قناة YouTube محددة. هل تريد المتابعة؟")) return;
      const button = buttonEvent.currentTarget; button.disabled = true; button.textContent = "جارٍ الإنشاء والنشر…";
      toast("بدأ إنشاء الفيديو؛ قد يستغرق ذلك عدة دقائق. أبقِ الصفحة مفتوحة.");
      try {
        const result = await accountApi("run");
        toast(result.ok ? "تم نشر الفيديو بنجاح" : (result.error || "تعذّر النشر"), result.ok ? "ok" : "err");
      } catch (error) { toast(error.message || "تعذّر تنفيذ النشر", "err"); }
      await refreshAccount();
    };
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
      if (k.endsWith("_err")) toast("تعذّر إتمام الربط — تأكد من الموافقة على الصلاحيات", "err");
      else if (k !== "undefined") toast("تم الربط بنجاح 🎉");
      history.replaceState(null, "", location.pathname + "#/account");
    } else wrap.hidden = true;
  }

  async function refreshAccount() {
    const sequence = ++refreshSequence;
    renderNotice();
    renderAuthCard();
    const dashboardRefresh = $id("acctDashboardRefresh");
    if (dashboardRefresh) dashboardRefresh.onclick = refreshAccount;
    const user = QRAuth.user();
    const dataNotice = $id("acctDataNotice");
    if (!user) {
      dashboardLoading = false; connectionsLoading = false; queueLoading = false;
      dashboardOwner = "";
      runSearch = ""; runStatusFilter = "all";
      conns = []; queue = []; connectionsError = ""; queueError = "";
      dashboard = { config: null, channels: [], runs: [], reciters: [] };
      dashboardError = "";
      if (dataNotice) { dataNotice.hidden = true; dataNotice.textContent = ""; }
      const stats = $id("acctStats"); if (stats) { stats.hidden = true; stats.innerHTML = ""; }
      renderChannels(); renderQueue(); renderAuto(); renderAutoRuns(); renderQuickActions(); renderDashboard(); syncHistoryPolling();
      const howTo = $id("acctHowTo"); if (howTo) howTo.hidden = false;
      return;
    }
    dashboardLoading = true; connectionsLoading = true; queueLoading = true;
    if (dashboardOwner !== String(user.id)) {
      runSearch = ""; runStatusFilter = "all";
      dashboardOwner = String(user.id);
      conns = []; queue = []; connectionsError = ""; queueError = "";
      dashboard = { config: { enabled: false, daily_count: 1, youtube_connection_ids: [], template: { content_mode: "mix", background: "rotate" } }, channels: [], runs: [], reciters: [] };
      dashboardError = "";
      const stats = $id("acctStats"); if (stats) { stats.hidden = true; stats.innerHTML = ""; }
      renderChannels(); renderQueue(); renderAuto(); renderDashboard();
    }
    renderChannels(); renderQueue(); renderAuto(); renderUpcomingSchedule();
    const dashStats = $id("acctDashStats");
    if (dashStats) dashStats.innerHTML = `<div class="acct-data-alert" role="status">جارٍ تحميل حالة الأتمتة والمهام…</div>`;
    if (dataNotice) { dataNotice.hidden = true; dataNotice.textContent = ""; }
    const runList = $id("acctRunList");
    if (runList) runList.innerHTML = `<div class="acct-empty"><span>📡</span><div><b>جارٍ تحديث حسابك</b><p>نحمّل بياناتك الخاصة بأمان…</p></div></div>`;
    const kanban = $id("acctKanban");
    if (kanban) kanban.innerHTML = `<div class="acct-empty compact"><span>📊</span><div><b>جارٍ تحميل لوحة النشر</b><p>نجمع الفيديوهات المجدولة والآلية…</p></div></div>`;
    await Promise.all([loadConnections(), loadQueue(), loadAutoHistory()]);
    if (sequence !== refreshSequence) return;
    dashboardLoading = false; connectionsLoading = false; queueLoading = false;
    renderAccountStats();
    renderDashboard();
    renderQuickActions();
    renderChannels();
    renderQueue();
    renderAuto();
    renderAutoRuns();
    syncHistoryPolling();
    const howTo = $id("acctHowTo"); if (howTo) howTo.hidden = false;
    const newSchedule = $id("btnNewSched");
    if (newSchedule) newSchedule.onclick = () => $id("schedFile")?.click();
    const historyRefresh = $id("acctRunsRefresh");
    if (historyRefresh) historyRefresh.onclick = refreshAutoRuns;
    if (dashboardError && dataNotice) {
      dataNotice.hidden = false;
      dataNotice.innerHTML = `تعذّر جلب بعض بيانات الحساب: ${esc(dashboardError)}. يمكنك إعادة المحاولة من زر تحديث السجل.`;
    }
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

  function openSchedule(path, blob, filename = "") {
    schedPath = path || ""; schedBlob = blob || null; schedName = filename || blob?.name || "scheduled.mp4";
    const modal = $id("schedOverlay");
    const def = PostGen.generate("youtube", selMeta());
    $id("schedTitle").value = def.title;
    $id("schedCaption").value = def.caption;
    $id("schedTags").value = def.hashtags;
    const d = new Date(Date.now() + 3600e3);
    d.setSeconds(0, 0);
    $id("schedWhen").value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    $id("schedFileLabel").textContent = schedPath ? "✓ الفيديو محفوظ مؤقتًا؛ سيُربط بالمهمة عند الحفظ." : (schedBlob ? `✓ تم اختيار ${esc(schedName || "ملف فيديو")} — لن يُرفع قبل حفظ الجدولة.` : "");
    modal.hidden = false;
  }
  async function submitSchedule() {
    const checked = [...document.querySelectorAll(".schedPlat:checked")].map(x => x.value);
    if (!checked.length) return toast("اختر منصة واحدة على الأقل", "err");
    const when = $id("schedWhen").value;
    if (!when) return toast("حدد وقت النشر", "err");
    const publishDate = new Date(when);
    if (Number.isNaN(publishDate.getTime())) return toast("وقت النشر غير صالح", "err");
    if (publishDate.getTime() <= Date.now() && !window.confirm("وقت النشر المحدد قد مضى؛ ستُرسل المهمة للنشر العلني خلال دقائق. هل تريد المتابعة؟")) return;
    const title = ($id("schedTitle").value || "ريلز قرآن").trim();
    const caption = ($id("schedCaption").value || "").trim();
    const hashtags = ($id("schedTags").value || "").trim();
    const submitButton = $id("schedSubmit");
    const cancelButton = $id("schedCancel");
    if (submitButton?.disabled) return;
    if (submitButton) { submitButton.disabled = true; submitButton.textContent = "جارٍ الحفظ…"; }
    if (cancelButton) cancelButton.disabled = true;
    try {
      const u = QRAuth.user(); if (!u) { $id("schedOverlay").hidden = true; return openLogin(); }
      let path = schedPath;
      if (!path && schedBlob) {
        path = await uploadVideo(schedBlob, schedName || "scheduled.mp4");
        schedPath = path;
      } else if (!path) { return toast("لا يوجد فيديو", "err"); }
      const publish_at = publishDate.toISOString();
      const rows = checked.map(p => ({
        user_id: u.id, platform: p, video_path: path, video_name: "reel.mp4",
        title: title.slice(0, 120), caption: caption.slice(0, 4000), hashtags: hashtags.slice(0, 500),
        status: "scheduled", publish_at,
      }));
      await sb(`/rest/v1/publish_queue`, { method: "POST", headers: restHeaders(), body: JSON.stringify(rows) });
      $id("schedOverlay").hidden = true;
      schedPath = ""; schedBlob = null; schedName = "";
      const past = new Date(publish_at) <= Date.now();
      toast(past ? "تمت الجدولة — ستُنشر خلال دقائق" : `مجدولة على ${checked.length} منصة ✓`);
      if (QRAuth.user()) { await loadQueue(); renderQueue(); }
    } catch (e) { toast(String(e.message || e), "err"); }
    finally { if (submitButton) { submitButton.disabled = false; submitButton.textContent = "احفظ في الجدول 🗓️"; } if (cancelButton) cancelButton.disabled = false; }
  }

  function openLogin() { $id("loginOverlay").hidden = false; }

  function wireGlobals() {
    if (!window._acctHistoryVisibilityWired) {
      window._acctHistoryVisibilityWired = true;
      document.addEventListener("visibilitychange", syncHistoryPolling);
    }
    const b = $id("btnSchedule"); // من نافذة نتيجة الإنشاء — يُربط في creator
    const sf = $id("schedFile");
    if (sf) sf.onchange = () => {
      const file = sf.files?.[0]; if (!file) return;
      if (!QRAuth.user()) { openLogin(); sf.value = ""; return; }
      if (!file.type.startsWith("video/") && !/\.(mp4|webm|mov|m4v)$/i.test(file.name)) {
        toast("اختر ملف فيديو بصيغة MP4 أو WebM", "err"); sf.value = ""; return;
      }
      if (!file.size) { toast("الملف فارغ؛ اختر فيديو آخر", "err"); sf.value = ""; return; }
      openSchedule("", file);
      sf.value = "";
    };
    const ss = $id("schedSubmit"); if (ss) ss.onclick = submitSchedule;
    const sc = $id("schedCancel"); if (sc) sc.onclick = () => {
      $id("schedOverlay").hidden = true; schedBlob = null; schedPath = ""; schedName = "";
      if (sf) sf.value = "";
      $id("schedFileLabel").textContent = "";
    };
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
      if (!blob || !blob.size) return toast("ملف الفيديو غير صالح", "err");
openSchedule("", blob, name || "quran-reel.mp4");
    },
    async afterLogin() {
      if (window._schedPending) {
        const { blob, name } = window._schedPending; window._schedPending = null;
        if (blob?.size) openSchedule("", blob, name || "quran-reel.mp4");
      }
      refreshAccount();
    },
  };
})();

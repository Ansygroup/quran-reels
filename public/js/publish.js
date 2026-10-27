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
    if (!queue.length) { wrap.innerHTML = `<div class="hint">لا مهام بعد — أنشئ فيديو ثم اضغط «جدولة للنشر»، أو أضف ملفًا من هنا.</div>`; return; }
    wrap.innerHTML = queue.map(r => {
      const p = PLATFORMS[r.platform] || { name: r.platform, icon: "•" };
      const d = new Date(r.publish_at);
      const when = isNaN(d) ? "" : d.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
      const canAct = r.status === "scheduled" || r.status === "failed";
      return `<div class="qrow">
        <span class="qic">${p.icon}</span>
        <div class="qinfo">
          <b>${esc(r.title || "ريلز")}</b>
          <small>${p.name} · ${when}${r.error ? ` · <i class="qerr">${esc(r.error.slice(0, 90))}</i>` : ""}${r.external_url ? ` · <a href="${esc(r.external_url)}" target="_blank" rel="noopener">فتح ↗</a>` : ""}</small>
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
      if (j.ok) toast("تم النشر بنجاح 🎉"); else toast(j.error || "تعذّر النشر — راجع ربط المنصة", "err");
    } catch (e) { toast(String(e.message || e), "err"); }
    refreshAccount();
  }

  async function renderAuto() {
    const wrap = $id("acctAuto"); if (!wrap) return;
    const a = await loadAuto() || { enabled: false, at_utc: "04:15:00", platforms: ["youtube"] };
    const plats = Array.isArray(a.platforms) ? a.platforms : ["youtube"];
    const hhmm = (a.at_utc || "04:15:00").slice(0, 5);
    wrap.innerHTML = `
      <div class="auto-head">
        <h3>🤖 الأتمتة — النشر التلقائي اليومي</h3>
        <label class="switch"><input type="checkbox" id="autoOn" ${a.enabled ? "checked" : ""}><i></i></label>
      </div>
      <p class="hint">مهام «المستحقة» تُنشر آليًا يوميًا الساعة <b>06:15 بتوقيت القاهرة</b> (ويمكنك النشر الفوري دائمًا). اضبط وقت المهام عند الجدولة حسب ذلك.</p>
      <div class="auto-row">
        <label>المنصات المفعّلة:</label>
        ${Object.entries(PLATFORMS).map(([k, p]) => `<label class="chk"><input type="checkbox" class="autoPlat" value="${k}" ${plats.includes(k) ? "checked" : ""}> ${p.icon} ${p.name}</label>`).join("")}
      </div>
      <button class="btn btn-gold" id="autoSave">حفظ الأتمتة</button>`;
    $id("autoSave").onclick = async () => {
      const enabled = $id("autoOn").checked;
      const platforms = [...document.querySelectorAll(".autoPlat:checked")].map(x => x.value);
      try {
        await saveAuto({ enabled, platforms, at_utc: (a.at_utc || "04:15:00") });
        toast(enabled ? "الأتمتة مفعّلة 🤖" : "تم حفظ الإعدادات");
      } catch (e) { toast("تعذّر الحفظ", "err"); }
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
    renderNotice();
    renderAuthCard();
    const u = QRAuth.user();
    if (u) { await loadConnections(); await loadQueue(); }
    renderChannels(); renderQueue(); renderAuto();
    // بطاقة المهمة الجديدة
    const ns = $id("btnNewSched");
    if (ns) ns.onclick = () => $id("schedFile").click();
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

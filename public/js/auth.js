/* ============================================================
   QRAuth — مصادقة Supabase خفيفة (رابط سحري + جوجل)
   الجلسة في localStorage، تجديد تلقائي، أحداث تغيير.
   ============================================================ */
const QRAuth = (() => {
  const LS = "qr_session";
  const listeners = [];
  let cfg = null, loading = null;
  let s = null, sessionRevision = 0, refreshInFlight = null;
  let storedValue = null, storageKnown = false;
  try {
    storedValue = localStorage.getItem(LS); storageKnown = true;
    s = JSON.parse(storedValue || "null");
  } catch {}

  async function conf() {
    if (cfg) return cfg;
    if (!loading) loading = fetch("/api/app-config", { cache: "no-store" }).then(r => r.json()).then(j => {
      cfg = j.supabase || { url: "", anon: "" };
      return cfg;
    }).catch(() => (cfg = { url: "", anon: "" }));
    return loading;
  }
  const base = async p => (await conf()).url + p;
  const authHeaders = async extra => {
    const c = await conf();
    return { apikey: c.anon, "Content-Type": "application/json", ...(extra || {}) };
  };
  function save(v) {
    s = v; sessionRevision++;
    let persisted = true;
    try {
      const value = v ? JSON.stringify(v) : null;
      v ? localStorage.setItem(LS, value) : localStorage.removeItem(LS);
      storedValue = value; storageKnown = true;
    } catch { persisted = false; }
    emit();
    return persisted;
  }
  function emit() { listeners.forEach(cb => { try { cb(s?.user || null); } catch {} }); }
  function adoptStored(value) {
    storedValue = value; storageKnown = true;
    try { s = JSON.parse(value || "null"); } catch { s = null; }
    sessionRevision++; emit();
  }
  // Storage events can be queued behind async completions. Observe an already
  // committed change before returning a token or applying an old response.
  // This read and a later write are NOT an atomic cross-tab compare-and-swap.
  function storageUnchanged() {
    try {
      const value = localStorage.getItem(LS);
      if (!storageKnown) { storedValue = value; storageKnown = true; return true; }
      if (value !== storedValue) { adoptStored(value); return false; }
    } catch { /* unavailable storage: retain the in-memory revision guard */ }
    return true;
  }

  async function refresh() {
    const snapshot = s, revision = sessionRevision;
    if (!snapshot?.refresh_token) return null;
    if (refreshInFlight?.revision === revision) return refreshInFlight.task;
    const current = () => revision === sessionRevision && s === snapshot && storageUnchanged();
    const task = (async () => {
      try {
        const c = await conf();
        if (!current()) return null;
        const r = await fetch(c.url + "/auth/v1/token?grant_type=refresh_token", {
          method: "POST", headers: { apikey: c.anon, "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: snapshot.refresh_token }),
        });
        if (!current()) return null;
        if (!r.ok) {
          // A temporary outage or rate limit is not proof that the session was revoked.
          if ([400, 401, 403].includes(r.status)) save(null);
          return null;
        }
        const j = await r.json();
        if (!current() || typeof j.access_token !== "string" || !j.access_token || (snapshot.user?.id && j.user?.id && snapshot.user.id !== j.user.id)) return null;
        const next = {
          access_token: j.access_token, refresh_token: j.refresh_token || snapshot.refresh_token,
          expires_at: Date.now() + (j.expires_in || 3600) * 1000 - 45000,
          user: { id: j.user?.id || snapshot.user?.id, email: j.user?.email || snapshot.user?.email, name: j.user?.user_metadata?.full_name || "" },
        };
        save(next);
        return next;
      } catch { return null; }
    })();
    refreshInFlight = { revision, task };
    try { return await task; }
    finally { if (refreshInFlight?.task === task) refreshInFlight = null; }
  }
  async function ensure() {
    if (!storageUnchanged()) return null;
    const snapshot = s;
    if (!snapshot) return null;
    if (snapshot.expires_at && snapshot.expires_at < Date.now()) {
      const next = await refresh();
      return next && s === next ? next : null;
    }
    return snapshot;
  }

  function user() { storageUnchanged(); return s?.user || null; }
  async function token() { const x = await ensure(); return x && s === x && storageUnchanged() ? x.access_token || null : null; }

  async function magicLink(email, redirect) {
    const r = await fetch(await base("/auth/v1/otp"), {
      method: "POST", headers: await authHeaders(),
      body: JSON.stringify({ email, create_user: true, redirect_to: redirect || location.origin + "/#/account" }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.msg || j.error_description || j.error || "تعذّر الإرسال — أعد المحاولة لاحقًا");
    }
    return true;
  }

  function google() {
    conf().then(async c => {
      if (!c.url) { toast("الإعدادات غير مكتملة", "err"); return; }
      let enabled = false;
      try {
        const r = await fetch(c.url + "/auth/v1/settings", { headers: { apikey: c.anon }, cache: "no-store" });
        const j = await r.json();
        enabled = j && j.external && j.external.google === true;
      } catch {}
      if (!enabled) {
        toast("تسجيل جوجل غير مُفعّل بعد — استخدم الرابط السحري، أو أضِف إعداد المزوّر (للمطوّر)", "err");
        return;
      }
      const to = encodeURIComponent(location.origin + "/#/account");
      location.href = `${c.url}/auth/v1/authorize?provider=google&redirect_to=${to}`;
    });
  }

  async function signOut() {
    if (!storageUnchanged()) return { local_cleared: false, remote: "not_attempted", session_changed: true, current_user: s?.user || null };
    const snapshot = s, logoutRevision = sessionRevision + 1;
    // Clear locally first; a stalled or late network response cannot restore it
    // or erase a different account signed in while the request was pending.
    const local_cleared = save(null);
    if (!snapshot?.access_token) return { local_cleared, remote: "not_attempted" };
    const controller = new AbortController();
    let timer;
    const deadline = new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve("unknown"); }, 12000); });
    const request = (async () => {
      try {
        const c = await conf();
        if (controller.signal.aborted || !c.url || !c.anon || sessionRevision !== logoutRevision || s !== null || !storageUnchanged()) return "unknown";
        // Scope local avoids intentionally signing out other devices. A request
        // already sent may still revoke a newly restored copy of the same session.
        const r = await fetch(c.url + "/auth/v1/logout?scope=local", {
          method: "POST", signal: controller.signal,
          headers: { apikey: c.anon, "Content-Type": "application/json", Authorization: "Bearer " + snapshot.access_token },
        });
        return r.ok ? "confirmed" : "unknown";
      } catch { return "unknown"; }
    })();
    const remote = await Promise.race([request, deadline]);
    clearTimeout(timer);
    return { local_cleared, remote };
  }

  /* تحليل رموز الجلسة من أي شكل رابط يعيده المزوّد:
     "#access_token=…" · "#/account#access_token=…" (مزدوج) · "?access_token=…" */
  function parseAuthHash(hash, search) {
    const src = String(hash || "") + "&" + String(search || "");
    const i = src.indexOf("access_token=");
    if (i === -1) return null;
    try {
      const p = new URLSearchParams(src.slice(i));
      const at = p.get("access_token");
      if (!at) return null;
      return {
        access_token: at,
        refresh_token: p.get("refresh_token") || "",
        expires_in: p.get("expires_in") || "3600",
        user_id: p.get("user_id") || "",
        email: p.get("email") || "",
        type: p.get("type") || "",
      };
    } catch { return null; }
  }

  /* معالجة رابط السحري القادم من البريد */
  function consumeHash() {
    const p = parseAuthHash(location.hash, location.search);
    if (!p) return false;
    save({
      access_token: p.access_token, refresh_token: p.refresh_token,
      expires_at: Date.now() + Number(p.expires_in || 3600) * 1000 - 45000,
      user: { id: p.user_id, email: p.email, name: "" },
    });
    try {
      history.replaceState(null, "", location.pathname + "#/account");
    } catch {}
    return true;
  }

  async function hydrateFromToken() {
    const snapshot = s, revision = sessionRevision;
    if (!snapshot?.access_token) return;
    const current = () => revision === sessionRevision && s === snapshot && storageUnchanged();
    try {
      const c = await conf();
      if (!current()) return;
      const r = await fetch(c.url + "/auth/v1/user", { headers: { apikey: c.anon, "Content-Type": "application/json", Authorization: "Bearer " + snapshot.access_token } });
      if (!current()) return;
      if (r.ok) {
        const u = await r.json();
        if (!current() || !u?.id || (snapshot.user?.id && snapshot.user.id !== u.id)) return;
        save({ ...snapshot, user: { id: u.id, email: u.email, name: u.user_metadata?.full_name || u.email?.split("@")[0] || "" } });
      } else if (r.status === 401 || r.status === 403) {
        const next = await refresh();
        if (next && s === next) hydrateFromToken();
      }
    } catch {}
  }

  window.addEventListener("storage", e => {
    if (e.key !== LS && e.key !== null) return;
    // The event may be queued behind another tab's later write: prefer the
    // current stored value over an older event payload when storage is readable.
    let value;
    try { value = localStorage.getItem(LS); } catch { value = e.key === LS ? e.newValue : null; }
    if (storageKnown && value === storedValue) return;
    adoptStored(value);
  });

  return {
    user, token, ensure, magicLink, google, signOut, conf, authHeaders, base, hydrateFromToken, parseAuthHash,
    on(cb) { listeners.push(cb); return cb; },
    boot() {
      const had = consumeHash();
      if (had) hydrateFromToken();
      else if (s) { ensure().then(current => { if (current && s === current) hydrateFromToken(); }); }
      emit();
    },
  };
})();

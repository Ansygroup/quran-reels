/* ============================================================
   QRAuth — مصادقة Supabase خفيفة (رابط سحري + جوجل)
   الجلسة في localStorage، تجديد تلقائي، أحداث تغيير.
   ============================================================ */
const QRAuth = (() => {
  const LS = "qr_session";
  const listeners = [];
  let cfg = null, loading = null;
  let s = null;
  try { s = JSON.parse(localStorage.getItem(LS) || "null"); } catch {}

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
    s = v;
    try { v ? localStorage.setItem(LS, JSON.stringify(v)) : localStorage.removeItem(LS); } catch {}
    emit();
  }
  function emit() { listeners.forEach(cb => { try { cb(user()); } catch {} }); }

  async function refresh() {
    if (!s?.refresh_token) return false;
    try {
      const r = await fetch(await base("/auth/v1/token?grant_type=refresh_token"), {
        method: "POST", headers: await authHeaders(),
        body: JSON.stringify({ refresh_token: s.refresh_token }),
      });
      if (!r.ok) { save(null); return false; }
      const j = await r.json();
      save({
        access_token: j.access_token, refresh_token: j.refresh_token || s.refresh_token,
        expires_at: Date.now() + (j.expires_in || 3600) * 1000 - 45000,
        user: { id: j.user?.id || s.user?.id, email: j.user?.email || s.user?.email, name: j.user?.user_metadata?.full_name || "" },
      });
      return true;
    } catch { return false; }
  }
  async function ensure() {
    if (!s) return null;
    if (s.expires_at && s.expires_at < Date.now()) await refresh();
    return s;
  }

  function user() { return s?.user || null; }
  async function token() { const x = await ensure(); return x?.access_token || null; }

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
    try {
      if (s?.access_token) await fetch(await base("/auth/v1/logout"), { method: "POST", headers: await authHeaders({ Authorization: "Bearer " + s.access_token }) });
    } catch {}
    save(null);
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
    if (!s?.access_token) return;
    try {
      const r = await fetch(await base("/auth/v1/user"), { headers: await authHeaders({ Authorization: "Bearer " + s.access_token }) });
      if (r.ok) {
        const u = await r.json();
        save({ ...s, user: { id: u.id, email: u.email, name: u.user_metadata?.full_name || u.email?.split("@")[0] || "" } });
      } else if (r.status === 401 || r.status === 403) { if (await refresh()) hydrateFromToken(); }
    } catch {}
  }

  window.addEventListener("storage", e => {
    if (e.key === LS) { try { s = JSON.parse(e.newValue || "null"); } catch { s = null; } emit(); }
  });

  return {
    user, token, ensure, magicLink, google, signOut, conf, authHeaders, base, hydrateFromToken, parseAuthHash,
    on(cb) { listeners.push(cb); return cb; },
    boot() {
      const had = consumeHash();
      if (had) hydrateFromToken();
      else if (s) { ensure().then(() => hydrateFromToken()); }
      emit();
    },
  };
})();

/* ============================================================
   QRAuth — مصادقة Firebase خفيفة (رابط سحري + جوجل)
   بدون SDK: Firebase Auth REST. الجلسة في localStorage مع تجديد
   تلقائي وأحداث تغيير. نفس واجهة النسخة السابقة.
   ============================================================ */
const QRAuth = (() => {
  const LS = "qr_fb_session";
  const LS_EMAIL = "qr_fb_email";
  const IT = "https://identitytoolkit.googleapis.com/v1/";
  const ST = "https://securetoken.googleapis.com/v1/token";
  const listeners = [];
  let cfg = null, loading = null;
  let s = null, refreshInFlight = null;

  try { localStorage.removeItem("qr_session"); } catch {}
  try { s = JSON.parse(localStorage.getItem(LS) || "null"); } catch { s = null; }

  function conf() {
    if (cfg) return Promise.resolve(cfg);
    if (!loading) loading = fetch("/api/app-config", { cache: "no-store" }).then(r => r.json()).then(j => {
      cfg = { key: j?.firebase?.apiKey || "", gcid: j?.firebase?.googleClientId || "" };
      return cfg;
    }).catch(() => { loading = null; return { key: "", gcid: "" }; });
    return loading;
  }
  async function base(path) { return path; }
  async function authHeaders(extra) { return { "Content-Type": "application/json", ...(extra || {}) }; }

  function emit() { const u = s?.user || null; listeners.forEach(cb => { try { cb(u); } catch {} }); }
  function save(v) {
    s = v || null;
    try { if (s) localStorage.setItem(LS, JSON.stringify(s)); else localStorage.removeItem(LS); } catch {}
    emit();
  }

  function fail(data, status) {
    const m = String((data && data.error && data.error.message) || "HTTP " + status);
    let msg = "تعذّر الإرسال — أعد المحاولة لاحقًا";
    if (/INVALID_EMAIL/.test(m)) msg = "البريد غير صحيح";
    else if (/TOO_MANY_ATTEMPTS|QUOTA/.test(m)) msg = "محاولات كثيرة — انتظر قليلًا ثم أعد المحاولة";
    else if (/UNAUTHORIZED_DOMAIN|OPERATION_NOT_ALLOWED|CONFIGURATION_NOT_FOUND/.test(m)) msg = "تسجيل الدخول غير مُفعّل لهذا الموقع بعد";
    return Object.assign(new Error(msg), { status, code: m });
  }
  async function idt(path, body) {
    const c = await conf();
    if (!c.key) throw new Error("الإعدادات غير مكتملة");
    const r = await fetch(IT + path + "?key=" + encodeURIComponent(c.key), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    let j = null; try { j = await r.json(); } catch {}
    if (!r.ok) throw fail(j, r.status);
    return j;
  }

  function normalise(d, email) {
    if (!d || !(d.idToken || d.id_token)) return null;
    const mail = d.email || email || s?.user?.email || "";
    return {
      access_token: d.idToken || d.id_token,
      refresh_token: d.refreshToken || d.refresh_token || s?.refresh_token || "",
      expires_at: Date.now() + (parseInt(d.expiresIn || d.expires_in || "3600", 10) - 60) * 1000,
      user: { id: d.localId || d.user_id || s?.user?.id || "", email: mail, name: d.displayName || mail.split("@")[0] || "" },
    };
  }

  /* هل تغيّرت الجلسة المخزّنة منذ بدء التجديد؟ (تبويب آخر قد يكون خرج قبل وصول حدث storage) */
  function superseded(snapshot) {
    let cur = null; try { cur = JSON.parse(localStorage.getItem(LS) || "null"); } catch { cur = null; }
    if (s === snapshot && (cur?.refresh_token || "") === (snapshot.refresh_token || "")) return false;
    if (s === snapshot) { s = cur; emit(); }
    return true;
  }

  async function refresh() {
    if (refreshInFlight) return refreshInFlight;
    const snapshot = s;
    if (!snapshot?.refresh_token) return null;
    refreshInFlight = (async () => {
      try {
        const c = await conf();
        const r = await fetch(ST + "?key=" + encodeURIComponent(c.key), {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: snapshot.refresh_token }).toString(),
        });
        if (superseded(snapshot)) return null; /* خرج المستخدم أو تبدّلت الجلسة (هنا أو في تبويب آخر) أثناء الانتظار: تجاهل الرد المتأخر */
        if (!r.ok) { if (r.status === 400 || r.status === 401) save(null); return null; }
        const d = await r.json();
        if (superseded(snapshot)) return null;
        const next = normalise(d);
        if (!next) return null;
        next.user = { ...snapshot.user, id: next.user.id || snapshot.user.id };
        save(next);
        return next;
      } catch { return null; } finally { refreshInFlight = null; }
    })();
    return refreshInFlight;
  }

  async function ensure() {
    if (!s) return null;
    if (s.expires_at && s.expires_at < Date.now()) return await refresh();
    return s;
  }
  function user() { return s?.user || null; }
  async function token() { const x = await ensure(); return x ? x.access_token || null : null; }

  async function magicLink(email, redirect) {
    const url = location.origin + "/?auth=link";
    await idt("accounts:sendOobCode", { requestType: "EMAIL_SIGNIN", email, continueUrl: url, canHandleCodeInApp: true });
    try { localStorage.setItem(LS_EMAIL, email); } catch {}
    return true;
  }

  function loadGis() {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) return resolve();
      const el = document.createElement("script");
      el.src = "https://accounts.google.com/gsi/client"; el.async = true;
      el.onload = () => resolve(); el.onerror = () => reject(new Error("network"));
      document.head.appendChild(el);
    });
  }

  function toastErr(m) { try { if (typeof toast === "function") toast(m, "err"); } catch {} }

  async function googleFlow() {
    const c = await conf();
    if (!c.gcid) { toastErr("تسجيل جوجل غير مُفعّل بعد — استخدم الرابط السحري"); return; }
    try {
      await loadGis();
      const tok = await new Promise((resolve, reject) => {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: c.gcid, scope: "openid email profile",
          callback: resp => resp && resp.access_token ? resolve(resp.access_token) : reject(new Error((resp && resp.error) || "cancelled")),
          error_callback: err => reject(new Error((err && err.type) || "cancelled")),
        });
        client.requestAccessToken({ prompt: "select_account" });
      });
      const d = await idt("accounts:signInWithIdp", {
        postBody: "access_token=" + encodeURIComponent(tok) + "&providerId=google.com",
        requestUri: location.origin, returnIdpCredential: true, returnSecureToken: true,
      });
      save(normalise(d));
      try { history.replaceState(null, "", location.pathname + "#/account"); } catch {}
    } catch (e) {
      if (!/cancel|closed|popup/i.test(String(e && e.message))) toastErr("تعذّر تسجيل الدخول بجوجل");
    }
  }
  function google() { googleFlow(); }

  async function consumeLink() {
    const q = new URLSearchParams(location.search);
    const code = q.get("oobCode");
    if (!code || q.get("mode") !== "signIn") return false;
    let email = ""; try { email = localStorage.getItem(LS_EMAIL) || ""; } catch {}
    if (!email) email = (typeof prompt === "function" && prompt("اكتب بريدك الإلكتروني لإكمال الدخول")) || "";
    if (!email) return false;
    try {
      const d = await idt("accounts:signInWithEmailLink", { email, oobCode: code });
      save(normalise(d, email));
      try { localStorage.removeItem(LS_EMAIL); } catch {}
      try { history.replaceState(null, "", location.pathname + "#/account"); } catch {}
      return true;
    } catch { toastErr("الرابط غير صالح أو انتهت صلاحيته"); return false; }
  }

  async function signOut() {
    /* تبويب آخر بدّل الحساب قبل وصول حدث storage: لا نخرج الحساب الأحدث بالخطأ */
    let cur = null; try { cur = JSON.parse(localStorage.getItem(LS) || "null"); } catch { cur = null; }
    if (s && cur && (cur.refresh_token || "") !== (s.refresh_token || "")) {
      s = cur; emit();
      return { local_cleared: false, session_changed: true, current_user: s.user, remote: "not_attempted" };
    }
    const had = !!s;
    save(null);
    return { local_cleared: true, remote: had ? "not_needed" : "not_attempted" };
  }

  async function hydrateFromToken() { await ensure(); }
  function parseAuthHash() { return null; }

  window.addEventListener("storage", e => {
    if (e.key !== LS && e.key !== null) return;
    try { s = JSON.parse(localStorage.getItem(LS) || "null"); } catch { s = null; }
    emit();
  });

  return {
    user, token, ensure, magicLink, google, signOut, conf, authHeaders, base, hydrateFromToken, parseAuthHash,
    on(cb) { listeners.push(cb); return cb; },
    boot() {
      consumeLink().then(() => { if (s) ensure().then(() => emit()); else emit(); });
      emit();
    },
  };
})();

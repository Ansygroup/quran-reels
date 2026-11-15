/* استقبال X — PKCE */
const { PLAT, cfg, configured, readStCookie, stCookieValid, failUrl, json, ORIGIN, validProviderId } = require("./oauth");
const { seal } = require("./crypt");
const { q } = require("./db");
const { ensureDefault } = require("./soc_default");
const { enableDefaultAutomation } = require("./autopilot");

module.exports = async (req, res) => {
  const back = (l) => { res.statusCode = 302; res.setHeader("Location", l); res.end(); };
  const u = new URL(req.url, "http://local");
  const code = u.searchParams.get("code"), st = u.searchParams.get("state");
  const saved = readStCookie(req, "x");
  /* الأسباب صريحة: رفض الصلاحيات ≠ كوكي محظور ≠ فشل تبادل الرمز */
  if (u.searchParams.get("error")) return back(failUrl("x", "denied"));
  if (!code || !st) return back(failUrl("x", "no_code"));
  if (!saved || saved.r !== st || !stCookieValid(req, "x", saved)) return back(failUrl("x", "state"));
  if (!configured("x")) return json(res, 501, { error: "X_CLIENT_ID/SECRET غير مضبوطين" });
  const c = cfg("x");
  let r;
  try { r = await fetch(PLAT.x.token, {
    method: "POST", redirect: "error",
    headers: {
      Authorization: "Basic " + Buffer.from(`${c.X_CLIENT_ID}:${c.X_CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code", code, redirect_uri: PLAT.x.redirect(ORIGIN()),
      code_verifier: saved.m?.v || "",
    }),
  }); } catch { return back(failUrl("x", "token")); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || typeof j?.access_token !== "string" || !j.access_token.trim() ||
      (j.refresh_token != null && (typeof j.refresh_token !== "string" || j.refresh_token !== j.refresh_token.trim()))) return back(failUrl("x", "token"));
  const hasRefresh = Boolean(j.refresh_token);
  let profile, me;
  try {
    profile = await fetch("https://api.x.com/2/users/me", { redirect: "error", headers: { Authorization: `Bearer ${j.access_token}` } });
    me = await profile.json();
  } catch { return back(failUrl("x", "identity")); }
  const d = me?.data || {};
  // A missing profile must never overwrite the shared placeholder account "me".
  if (!profile.ok || !validProviderId(d.id)) return back(failUrl("x", "identity"));
  // Two static statements keep both SQL and the REST translator's PATCH explicit:
  // absent refresh credentials must not overwrite the currently stored value.
  const params = [saved.u, d.id, d.username ? "@" + d.username : "X", seal(JSON.stringify({ name: d.name || "" })),
    seal(j.access_token), seal(j.refresh_token || ""), j.expires_in ? Date.now() + j.expires_in * 1000 : null, PLAT.x.scopes.join(" ")];
  const stored = await (hasRefresh
    ? q(`insert into social_connections (user_id, platform, account_id, account_name, meta, access_token, refresh_token, expires_at, scopes, updated_at)
       values ($1,'x',$2,$3,$4,$5,$6,$7,$8,now())
       on conflict (user_id, platform, account_id)
       do update set account_name=excluded.account_name, meta=excluded.meta, access_token=excluded.access_token,
         refresh_token=excluded.refresh_token, expires_at=excluded.expires_at, updated_at=now() returning *`, params)
    : q(`insert into social_connections (user_id, platform, account_id, account_name, meta, access_token, refresh_token, expires_at, scopes, updated_at)
       values ($1,'x',$2,$3,$4,$5,$6,$7,$8,now())
       on conflict (user_id, platform, account_id)
       do update set account_name=excluded.account_name, meta=excluded.meta, access_token=excluded.access_token,
         expires_at=excluded.expires_at, updated_at=now() returning *`, params)
  ).then(rows => {
    // An empty, lost or inconsistent representation is not evidence of a
    // link, even when the database may have committed. Do not retry it here.
    const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
    return !!row && typeof row.id === "string" && !!row.id.trim() && row.user_id === saved.u &&
      row.platform === "x" && row.account_id === d.id && row.access_token === params[4] &&
      (!hasRefresh || row.refresh_token === params[5]);
  }).catch(() => { console.error("x store: result unconfirmed"); return false; });
  if (!stored) return back(failUrl("x", "store"));
  await ensureDefault(saved.u, "x");
  /* «اربط وخلاص»: نضمن إعداد أتمتة مفعّلًا فور الربط */
  const auto = await enableDefaultAutomation(saved.u, "x");
  back("/#/account?linked=x" + (auto === "error" ? "&auto_error=1" : ""));
};

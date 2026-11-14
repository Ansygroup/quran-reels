/* استقبال TikTok — توكن + open_id */
const { PLAT, cfg, configured, readStCookie, stCookieValid, failUrl, json, ORIGIN, validProviderId } = require("./oauth");
const { seal } = require("./crypt");
const { q } = require("./db");
const { ensureDefault } = require("./soc_default");
const { enableDefaultAutomation } = require("./autopilot");

module.exports = async (req, res) => {
  const back = (l) => { res.statusCode = 302; res.setHeader("Location", l); res.end(); };
  const u = new URL(req.url, "http://local");
  const code = u.searchParams.get("code"), st = u.searchParams.get("state");
  const saved = readStCookie(req, "tiktok");
  /* الأسباب صريحة: رفض الصلاحيات ≠ كوكي محظور ≠ فشل تبادل الرمز */
  if (u.searchParams.get("error")) return back(failUrl("tiktok", "denied"));
  if (!code || !st) return back(failUrl("tiktok", "no_code"));
  if (!saved || saved.r !== st || !stCookieValid(req, "tiktok", saved)) return back(failUrl("tiktok", "state"));
  if (!configured("tiktok")) return json(res, 501, { error: "TIKTOK_CLIENT_KEY/SECRET غير مضبوطين" });
  const c = cfg("tiktok");
  const r = await fetch(PLAT.tiktok.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: c.TIKTOK_CLIENT_KEY, client_secret: c.TIKTOK_CLIENT_SECRET,
      code, grant_type: "authorization_code", redirect_uri: PLAT.tiktok.redirect(ORIGIN()),
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || typeof j?.access_token !== "string" || !j.access_token.trim() ||
      (j.refresh_token != null && (typeof j.refresh_token !== "string" || j.refresh_token !== j.refresh_token.trim()))) return back(failUrl("tiktok", "token"));
  const hasRefresh = Boolean(j.refresh_token);
  let profile, info;
  try {
    profile = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name", { headers: { Authorization: `Bearer ${j.access_token}` } });
    info = await profile.json();
  } catch { return back(failUrl("tiktok", "identity")); }
  const user = info?.data?.user || {};
  // Use an identity returned for this token, never a shared placeholder. If
  // both endpoints supply IDs, disagreement is not safe to guess through.
  if (!profile.ok || (info?.error?.code && info.error.code !== "ok") || !validProviderId(user.open_id) ||
      (j.open_id != null && (!validProviderId(j.open_id) || j.open_id !== user.open_id))) return back(failUrl("tiktok", "identity"));
  // Two static statements keep both SQL and the REST translator's PATCH explicit:
  // absent refresh credentials must not overwrite the currently stored value.
  const params = [saved.u, user.open_id, user.display_name || "TikTok", seal(JSON.stringify({ open_id: user.open_id })),
    seal(j.access_token), seal(j.refresh_token || ""), Date.now() + (j.expires_in || 86400) * 1000, PLAT.tiktok.scopes.join(" ")];
  const stored = await (hasRefresh
    ? q(`insert into social_connections (user_id, platform, account_id, account_name, meta, access_token, refresh_token, expires_at, scopes, updated_at)
       values ($1,'tiktok',$2,$3,$4,$5,$6,$7,$8,now())
       on conflict (user_id, platform, account_id)
       do update set account_name=excluded.account_name, meta=excluded.meta, access_token=excluded.access_token,
         refresh_token=excluded.refresh_token, expires_at=excluded.expires_at, updated_at=now()`, params)
    : q(`insert into social_connections (user_id, platform, account_id, account_name, meta, access_token, refresh_token, expires_at, scopes, updated_at)
       values ($1,'tiktok',$2,$3,$4,$5,$6,$7,$8,now())
       on conflict (user_id, platform, account_id)
       do update set account_name=excluded.account_name, meta=excluded.meta, access_token=excluded.access_token,
         expires_at=excluded.expires_at, updated_at=now()`, params)
  ).then(() => true).catch(e => { console.error("tt store", e); return false; });
  if (!stored) return back(failUrl("tiktok", "store"));
  await ensureDefault(saved.u, "tiktok");
  /* «اربط وخلاص»: نضمن إعداد أتمتة مفعّلًا فور الربط */
  const auto = await enableDefaultAutomation(saved.u, "tiktok");
  back("/#/account?linked=tiktok" + (auto === "error" ? "&auto_error=1" : ""));
};

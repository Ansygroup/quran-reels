/* استقبال TikTok — توكن + open_id */
const { PLAT, cfg, configured, readStCookie, stCookieValid, json, ORIGIN } = require("./oauth");
const { seal } = require("./crypt");
const { q } = require("./db");

module.exports = async (req, res) => {
  const back = (l) => { res.statusCode = 302; res.setHeader("Location", l); res.end(); };
  const u = new URL(req.url, "http://local");
  const code = u.searchParams.get("code"), st = u.searchParams.get("state");
  const saved = readStCookie(req, "tiktok");
  if (!code || !st || !saved || saved.r !== st || !stCookieValid(req, "tiktok", saved)) return back("/#/account?linked=tiktok_err");
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
  if (!j.access_token) return back("/#/account?linked=tiktok_err");
  const info = await (await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name", { headers: { Authorization: `Bearer ${j.access_token}` } })).json().catch(() => ({}));
  const user = info.data?.user || {};
  await q(
    `insert into social_connections (user_id, platform, account_id, account_name, meta, access_token, refresh_token, expires_at, scopes, updated_at)
     values ($1,'tiktok',$2,$3,$4,$5,$6,$7,$8,now())
     on conflict (user_id, platform, account_id)
     do update set account_name=excluded.account_name, meta=excluded.meta, access_token=excluded.access_token,
       refresh_token=excluded.refresh_token, expires_at=excluded.expires_at, updated_at=now()`,
    [saved.u, j.open_id || user.open_id || "me", user.display_name || "TikTok", seal(JSON.stringify({ open_id: j.open_id || user.open_id })),
      seal(j.access_token), seal(j.refresh_token || ""), Date.now() + (j.expires_in || 86400) * 1000, PLAT.tiktok.scopes.join(" ")]
  ).catch(e => console.error("tt store", e));
  back("/#/account?linked=tiktok");
};

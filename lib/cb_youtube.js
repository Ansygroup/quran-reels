/* استقبال OAuth جوجل — يوتيوب: رمز → توكنات → قناة → صف مربوط */
const { PLAT, cfg, configured, readStCookie, stCookieValid, json, ORIGIN } = require("./oauth");
const { seal } = require("./crypt");
const { q } = require("./db");

module.exports = async (req, res) => {
  const back = (q2, code = 302) => { res.statusCode = code; res.setHeader("Location", q2); res.end(); };
  const u = new URL(req.url, "http://local");
  const code = u.searchParams.get("code"), st = u.searchParams.get("state");
  const saved = readStCookie(req, "youtube");
  if (!code || !st || !saved || saved.r !== st || !stCookieValid(req, "youtube", saved)) return back("/#/account?linked=youtube_err");
  if (!configured("youtube")) return json(res, 501, { error: "GOOGLE_CLIENT_ID/SECRET غير مضبوطين" });
  const rd = PLAT.youtube.redirect(ORIGIN());
  const c = cfg("youtube");
  const r = await fetch(PLAT.youtube.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: c.GOOGLE_CLIENT_ID, client_secret: c.GOOGLE_CLIENT_SECRET, redirect_uri: rd, grant_type: "authorization_code" }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) return back("/#/account?linked=youtube_err");
  const ch = await (await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${j.access_token}` } })).json().catch(() => ({}));
  const item = (ch.items || [])[0] || {};
  const title = item.snippet?.title || "قناة يوتيوب";
  await q(
    `insert into social_connections (user_id, platform, account_id, account_name, meta, access_token, refresh_token, expires_at, scopes, updated_at)
     values ($1,'youtube',$2,$3,$4,$5,$6,$7,$8,now())
     on conflict (user_id, platform, account_id)
     do update set account_name=excluded.account_name, meta=excluded.meta, access_token=excluded.access_token,
       refresh_token=excluded.refresh_token, expires_at=excluded.expires_at, updated_at=now()`,
    [saved.u, item.id || "me", title, seal(JSON.stringify({ channel: title, channel_id: item.id || "" })),
      seal(j.access_token), seal(j.refresh_token || ""), j.refresh_token ? Date.now() + (j.expires_in || 3600) * 1000 : null,
      PLAT.youtube.scopes.join(" ")]
  ).catch(e => console.error("yt store", e));
  back("/#/account?linked=youtube");
};

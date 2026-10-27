/* استقبال X — PKCE */
const { PLAT, cfg, configured, readStCookie, stCookieValid, json, ORIGIN } = require("./oauth");
const { seal } = require("./crypt");
const { q } = require("./db");

module.exports = async (req, res) => {
  const back = (l) => { res.statusCode = 302; res.setHeader("Location", l); res.end(); };
  const u = new URL(req.url, "http://local");
  const code = u.searchParams.get("code"), st = u.searchParams.get("state");
  const saved = readStCookie(req, "x");
  if (!code || !st || !saved || saved.r !== st || !stCookieValid(req, "x", saved)) return back("/#/account?linked=x_err");
  if (!configured("x")) return json(res, 501, { error: "X_CLIENT_ID/SECRET غير مضبوطين" });
  const c = cfg("x");
  const r = await fetch(PLAT.x.token, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${c.X_CLIENT_ID}:${c.X_CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code", code, redirect_uri: PLAT.x.redirect(ORIGIN()),
      code_verifier: saved.m?.v || "",
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) return back("/#/account?linked=x_err");
  const me = await (await fetch("https://api.x.com/2/users/me", { headers: { Authorization: `Bearer ${j.access_token}` } })).json().catch(() => ({}));
  const d = me.data || {};
  await q(
    `insert into social_connections (user_id, platform, account_id, account_name, meta, access_token, refresh_token, expires_at, scopes, updated_at)
     values ($1,'x',$2,$3,$4,$5,$6,$7,$8,now())
     on conflict (user_id, platform, account_id)
     do update set account_name=excluded.account_name, meta=excluded.meta, access_token=excluded.access_token,
       refresh_token=excluded.refresh_token, expires_at=excluded.expires_at, updated_at=now()`,
    [saved.u, d.id || "me", d.username ? "@" + d.username : "X", seal(JSON.stringify({ name: d.name || "" })),
      seal(j.access_token), seal(j.refresh_token || ""), j.expires_in ? Date.now() + j.expires_in * 1000 : null, PLAT.x.scopes.join(" ")]
  ).catch(e => console.error("x store", e));
  back("/#/account?linked=x");
};

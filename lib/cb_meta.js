/* استقبال Meta (فيسبوك صفحات + إنستغرام) — توكن طويل الأمد + قائمة الصفحات */
const { PLAT, cfg, configured, readStCookie, stCookieValid, json, ORIGIN } = require("./oauth");
const { seal } = require("./crypt");
const { q } = require("./db");

module.exports = async (req, res) => {
  const back = (l) => { res.statusCode = 302; res.setHeader("Location", l); res.end(); };
  const u = new URL(req.url, "http://local");
  const code = u.searchParams.get("code"), st = u.searchParams.get("state");
  const saved = readStCookie(req, "meta");
  if (!code || !st || !saved || saved.r !== st || !stCookieValid(req, "meta", saved)) return back("/#/account?linked=meta_err");
  if (!configured("meta")) return json(res, 501, { error: "META_APP_ID/SECRET غير مضبوطين" });
  const rd = PLAT.meta.redirect(ORIGIN());
  const c = cfg("meta");
  const ex = await (await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?client_id=${c.META_APP_ID}&client_secret=${c.META_APP_SECRET}&redirect_uri=${encodeURIComponent(rd)}&code=${code}`)).json().catch(() => ({}));
  if (!ex.access_token) return back("/#/account?linked=meta_err");
  const long = await (await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${c.META_APP_ID}&client_secret=${c.META_APP_SECRET}&fb_exchange_token=${ex.access_token}`)).json().catch(() => ({}));
  const lt = long.access_token || ex.access_token;
  const pages = await (await fetch(`https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=20`, { headers: { Authorization: `Bearer ${lt}` } })).json().catch(() => ({}));
  const list = (pages.data || []).map(p => ({ id: p.id, name: p.name, access_token: p.access_token, ig: p.instagram_business_account || null }));
  const name = list[0]?.name || "صفحة فيسبوك";
  const exp = Date.now() + (long.expires_in || 5184000) * 1000;
  await q(
    `insert into social_connections (user_id, platform, account_id, account_name, meta, access_token, refresh_token, expires_at, scopes, updated_at)
     values ($1,'facebook',$2,$3,$4,$5,'',$6,$7,now())
     on conflict (user_id, platform, account_id)
     do update set account_name=excluded.account_name, meta=excluded.meta, access_token=excluded.access_token,
       expires_at=excluded.expires_at, updated_at=now()`,
    [saved.u, list[0]?.id || "me", name, seal(JSON.stringify({ pages: list })), seal(lt), exp, PLAT.meta.scopes.join(" ")]
  ).catch(e => console.error("meta store", e));
  const ig = list.find(p => p.ig)?.ig;
  if (ig) {
    await q(
      `insert into social_connections (user_id, platform, account_id, account_name, meta, access_token, refresh_token, expires_at, scopes, updated_at)
       values ($1,'instagram',$2,$3,$4,$5,'',$6,$7,now())
       on conflict (user_id, platform, account_id)
       do update set account_name=excluded.account_name, meta=excluded.meta, access_token=excluded.access_token,
         expires_at=excluded.expires_at, updated_at=now()`,
      [saved.u, ig.id, ig.username ? "@" + ig.username : "Instagram", seal(JSON.stringify({ ig_id: ig.id, username: ig.username })), seal(lt), exp, PLAT.meta.scopes.join(" ")]
    ).catch(e => console.error("ig store", e));
  }
  back("/#/account?linked=meta");
};

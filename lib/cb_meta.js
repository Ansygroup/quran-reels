/* استقبال Meta (فيسبوك صفحات + إنستغرام) — توكن طويل الأمد + قائمة الصفحات */
const { PLAT, cfg, configured, readStCookie, stCookieValid, failUrl, json, ORIGIN } = require("./oauth");
const { seal } = require("./crypt");
const { q } = require("./db");
const { ensureDefault } = require("./soc_default");
const { enableDefaultAutomation } = require("./autopilot");

module.exports = async (req, res) => {
  const back = (l) => { res.statusCode = 302; res.setHeader("Location", l); res.end(); };
  const u = new URL(req.url, "http://local");
  const code = u.searchParams.get("code"), st = u.searchParams.get("state");
  const saved = readStCookie(req, "meta");
  /* الأسباب صريحة: رفض الصلاحيات ≠ كوكي محظور ≠ فشل تبادل الرمز */
  if (u.searchParams.get("error")) return back(failUrl("meta", "denied"));
  if (!code || !st) return back(failUrl("meta", "no_code"));
  if (!saved || saved.r !== st || !stCookieValid(req, "meta", saved)) return back(failUrl("meta", "state"));
  if (!configured("meta")) return json(res, 501, { error: "META_APP_ID/SECRET غير مضبوطين" });
  const rd = PLAT.meta.redirect(ORIGIN());
  const c = cfg("meta");
  const ex = await (await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?client_id=${c.META_APP_ID}&client_secret=${c.META_APP_SECRET}&redirect_uri=${encodeURIComponent(rd)}&code=${code}`)).json().catch(() => ({}));
  if (!ex.access_token) return back(failUrl("meta", "token"));
  const long = await (await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${c.META_APP_ID}&client_secret=${c.META_APP_SECRET}&fb_exchange_token=${ex.access_token}`)).json().catch(() => ({}));
  const lt = long.access_token || ex.access_token;
  const pages = await (await fetch(`https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=20`, { headers: { Authorization: `Bearer ${lt}` } })).json().catch(() => ({}));
  const list = (pages.data || []).map(p => ({ id: p.id, name: p.name, access_token: p.access_token, ig: p.instagram_business_account || null }));
  const name = list[0]?.name || "صفحة فيسبوك";
  const exp = Date.now() + (long.expires_in || 5184000) * 1000;
  const stored = await q(
    `insert into social_connections (user_id, platform, account_id, account_name, meta, access_token, refresh_token, expires_at, scopes, updated_at)
     values ($1,'facebook',$2,$3,$4,$5,'',$6,$7,now())
     on conflict (user_id, platform, account_id)
     do update set account_name=excluded.account_name, meta=excluded.meta, access_token=excluded.access_token,
       expires_at=excluded.expires_at, updated_at=now()`,
    [saved.u, list[0]?.id || "me", name, seal(JSON.stringify({ pages: list })), seal(lt), exp, PLAT.meta.scopes.join(" ")]
  ).then(() => true).catch(e => { console.error("meta store", e); return false; });
  if (!stored) return back(failUrl("meta", "store"));
  await ensureDefault(saved.u, "facebook");
  /* «اربط وخلاص» — أتمتة مفعّلة فور الربط */
  const auto = await enableDefaultAutomation(saved.u, "facebook");
  const ig = list.find(p => p.ig)?.ig;
  if (ig) {
    const igStored = await q(
      `insert into social_connections (user_id, platform, account_id, account_name, meta, access_token, refresh_token, expires_at, scopes, updated_at)
       values ($1,'instagram',$2,$3,$4,$5,'',$6,$7,now())
       on conflict (user_id, platform, account_id)
       do update set account_name=excluded.account_name, meta=excluded.meta, access_token=excluded.access_token,
         expires_at=excluded.expires_at, updated_at=now()`,
      [saved.u, ig.id, ig.username ? "@" + ig.username : "Instagram", seal(JSON.stringify({ ig_id: ig.id, username: ig.username })), seal(lt), exp, PLAT.meta.scopes.join(" ")]
    ).then(() => true).catch(e => { console.error("ig store", e); return false; });
    if (!igStored) return back(failUrl("meta", "store"));
    await ensureDefault(saved.u, "instagram");
    await enableDefaultAutomation(saved.u, "instagram");
  }
  back("/#/account?linked=meta" + (auto === "error" ? "&auto_error=1" : ""));
};

/* استقبال Meta (فيسبوك صفحات + إنستغرام) — توكن طويل الأمد + قائمة الصفحات */
const { PLAT, cfg, configured, readStCookie, stCookieValid, failUrl, json, ORIGIN, validProviderId } = require("./oauth");
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
  const validToken = value => typeof value === "string" && value.length > 0 && value === value.trim();
  let exRes, ex, longRes, long;
  try {
    exRes = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?client_id=${c.META_APP_ID}&client_secret=${c.META_APP_SECRET}&redirect_uri=${encodeURIComponent(rd)}&code=${encodeURIComponent(code)}`);
    ex = await exRes.json();
    if (!exRes.ok || ex?.error || !validToken(ex?.access_token)) return back(failUrl("meta", "token"));
    longRes = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${c.META_APP_ID}&client_secret=${c.META_APP_SECRET}&fb_exchange_token=${encodeURIComponent(ex.access_token)}`);
    long = await longRes.json();
    if (!longRes.ok || long?.error || !validToken(long?.access_token)) return back(failUrl("meta", "token"));
  } catch { return back(failUrl("meta", "token")); }
  const lt = long.access_token;
  let pageRes, pages;
  try {
    pageRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=20`, { headers: { Authorization: `Bearer ${lt}` } });
    pages = await pageRes.json();
  } catch { return back(failUrl("meta", "identity")); }
  if (!pageRes.ok || pages?.error || !Array.isArray(pages?.data) || pages.data.length === 0) return back(failUrl("meta", "identity"));
  // There is no page picker yet. Never silently select one page from a list
  // that is multiple or paginated; that choice determines the publish target.
  if (pages.data.length !== 1 || pages.paging?.next) return back(failUrl("meta", "pages"));
  const page = pages.data[0];
  if (!page || typeof page !== "object" || !validProviderId(page.id) || !validToken(page.access_token)) return back(failUrl("meta", "identity"));
  const rawIg = page.instagram_business_account ?? null;
  if (rawIg !== null && (typeof rawIg !== "object" || !validProviderId(rawIg.id))) return back(failUrl("meta", "identity"));
  const list = [{ id: page.id, name: typeof page.name === "string" ? page.name : "", access_token: page.access_token,
    ig: rawIg ? { id: rawIg.id, username: typeof rawIg.username === "string" ? rawIg.username : "" } : null }];
  const name = list[0].name || "صفحة فيسبوك";
  const seconds = Number(long.expires_in);
  const exp = Number.isFinite(seconds) && seconds > 0 && Number.isSafeInteger(Math.floor(Date.now() + seconds * 1000)) ? Math.floor(Date.now() + seconds * 1000) : null;
  const stored = await q(
    `insert into social_connections (user_id, platform, account_id, account_name, meta, access_token, refresh_token, expires_at, scopes, updated_at)
     values ($1,'facebook',$2,$3,$4,$5,'',$6,$7,now())
     on conflict (user_id, platform, account_id)
     do update set account_name=excluded.account_name, meta=excluded.meta, access_token=excluded.access_token,
       expires_at=excluded.expires_at, updated_at=now()`,
    [saved.u, list[0].id, name, seal(JSON.stringify({ pages: list })), seal(lt), exp, PLAT.meta.scopes.join(" ")]
  ).then(() => true).catch(e => { console.error("meta store", e); return false; });
  if (!stored) return back(failUrl("meta", "store"));
  await ensureDefault(saved.u, "facebook");
  /* «اربط وخلاص» — أتمتة مفعّلة فور الربط */
  const auto = await enableDefaultAutomation(saved.u, "facebook");
  let autoError = auto === "error";
  const ig = list[0].ig;
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
    if (await enableDefaultAutomation(saved.u, "instagram") === "error") autoError = true;
  }
  back("/#/account?linked=meta" + (autoError ? "&auto_error=1" : ""));
};

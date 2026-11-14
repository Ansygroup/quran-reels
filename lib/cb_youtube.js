/* استقبال OAuth جوجل — يوتيوب: رمز → توكنات → قناة → صف مربوط */
const { PLAT, cfg, configured, readStCookie, stCookieValid, failUrl, json, ORIGIN, validProviderId } = require("./oauth");
const { seal } = require("./crypt");
const { q, q1 } = require("./db");
const { readRefreshToken } = require("./refresh_token");
const { ensureDefault } = require("./soc_default");
const { enableDefaultAutomation } = require("./autopilot");

module.exports = async (req, res) => {
  const back = (q2, code = 302) => { res.statusCode = code; res.setHeader("Location", q2); res.end(); };
  const u = new URL(req.url, "http://local");
  const code = u.searchParams.get("code"), st = u.searchParams.get("state");
  const saved = readStCookie(req, "youtube");
  /* الأسباب صريحة: رفض الصلاحيات ≠ كوكي محظور ≠ فشل تبادل الرمز */
  if (u.searchParams.get("error")) return back(failUrl("youtube", "denied"));
  if (!code || !st) return back(failUrl("youtube", "no_code"));
  if (!saved || saved.r !== st || !stCookieValid(req, "youtube", saved)) return back(failUrl("youtube", "state"));
  if (!configured("youtube")) return json(res, 501, { error: "GOOGLE_CLIENT_ID/SECRET غير مضبوطين" });
  const rd = PLAT.youtube.redirect(ORIGIN());
  const c = cfg("youtube");
  let r;
  try { r = await fetch(PLAT.youtube.token, {
    method: "POST", redirect: "error",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: c.GOOGLE_CLIENT_ID, client_secret: c.GOOGLE_CLIENT_SECRET, redirect_uri: rd, grant_type: "authorization_code" }),
  }); } catch { return back(failUrl("youtube", "token")); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || typeof j?.access_token !== "string" || !j.access_token.trim() || j.error != null ||
      (j.refresh_token != null && (typeof j.refresh_token !== "string" || j.refresh_token !== j.refresh_token.trim()))) return back(failUrl("youtube", "token"));
  let profile, ch;
  try {
    profile = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { redirect: "error", headers: { Authorization: `Bearer ${j.access_token}` } });
    ch = await profile.json();
  } catch { return back(failUrl("youtube", "channel")); }
  const item = Array.isArray(ch?.items) ? ch.items[0] : null;
  if (!profile.ok || ch?.error != null || !validProviderId(item?.id)) return back(failUrl("youtube", "channel")); // لا نحفظ ربطًا على قناة مجهولة.
  const title = item.snippet?.title || "قناة يوتيوب";
  let encryptedRefresh = j.refresh_token ? seal(j.refresh_token) : "";
  if (!j.refresh_token && item.id) {
    // قد لا تُرسل جوجل refresh_token عند إعادة الربط؛ لا نمسح السابق لنفس القناة.
    try {
      const previous = await q1(`select refresh_token from social_connections where user_id=$1 and platform=$2 and account_id=$3 limit 1`, [saved.u, "youtube", item.id]);
      if (previous && readRefreshToken(previous.refresh_token)) encryptedRefresh = previous.refresh_token;
    } catch { return back(failUrl("youtube", "store")); } // القراءة المجهولة لا تبرّر محو التوكن.
  }
  const stored = await q(
    `insert into social_connections (user_id, platform, account_id, account_name, meta, access_token, refresh_token, expires_at, scopes, updated_at)
     values ($1,'youtube',$2,$3,$4,$5,$6,$7,$8,now())
     on conflict (user_id, platform, account_id)
     do update set account_name=excluded.account_name, meta=excluded.meta, access_token=excluded.access_token,
       refresh_token=excluded.refresh_token, expires_at=excluded.expires_at, updated_at=now()`,
    [saved.u, item.id, title, seal(JSON.stringify({ channel: title, channel_id: item.id || "" })),
      seal(j.access_token), encryptedRefresh, Date.now() + (Number(j.expires_in) || 3600) * 1000,
      PLAT.youtube.scopes.join(" ")]
  ).then(() => true).catch(e => { console.error("yt store", e); return false; });
  if (!stored) return back(failUrl("youtube", "store"));
  await ensureDefault(saved.u, "youtube");
  /* «اربط وخلاص»: نضمن إعداد أتمتة مفعّلًا فور الربط (وإلا لن ينشر شيء حتى يضغط حفظ) */
  const auto = await enableDefaultAutomation(saved.u, "youtube");
  // Relinking must not silently re-upload an old failed row: the destination
  // or outcome may be uncertain, and legacy evidence can be modified directly.
  // الربط بقناة ثانية لا يغيّر القناة الافتراضية من وراء المستخدم.
  let nonDefault = false;
  try {
    const channel = item.id && await q1(`select is_default from social_connections where user_id=$1 and platform=$2 and account_id=$3 limit 1`, [saved.u, "youtube", item.id]);
    nonDefault = channel?.is_default === false;
  } catch { /* لا نفترض الافتراضية إذا تعذّرت القراءة */ }
  back("/#/account?linked=youtube" + (auto === "error" ? "&auto_error=1" : "") + (nonDefault ? "&channel=nondefault" : ""));
};

/* إعدادات OAuth لكل منصة + كوكي الحالة الآمن */
const { sign, unsign } = require("./crypt");

const ORIGIN = () => process.env.SITE_ORIGIN || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

const PLAT = {
  youtube: {
    env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    auth: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scopes: ["openid", "profile", "https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"],
    redirect: p => `${p}/api/oauth/youtube/callback`,
    params: (cfg, rd, st) => ({
      client_id: cfg.GOOGLE_CLIENT_ID, redirect_uri: rd, response_type: "code",
      scope: PLAT.youtube.scopes.join(" "), state: st,
      access_type: "offline", prompt: "consent", include_granted_scopes: "true",
    }),
  },
  meta: { // فيسبوك + صفحات + إنستغرام
    env: ["META_APP_ID", "META_APP_SECRET"],
    auth: "https://www.facebook.com/v21.0/dialog/oauth",
    token: "https://graph.facebook.com/v21.0/oauth/access_token",
    scopes: ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "pages_read_user_content", "instagram_basic", "instagram_content_publish", "business_management"],
    redirect: p => `${p}/api/oauth/meta/callback`,
    params: (cfg, rd, st) => ({
      client_id: cfg.META_APP_ID, redirect_uri: rd, response_type: "code",
      scope: PLAT.meta.scopes.join(","), state: st,
    }),
  },
  tiktok: {
    env: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    auth: "https://www.tiktok.com/v2/auth/authorize/",
    token: "https://open.tiktokapis.com/oauth/token/",
    scopes: ["user.info.basic", "video.publish"],
    redirect: p => `${p}/api/oauth/tiktok/callback`,
    params: (cfg, rd, st) => ({
      client_key: cfg.TIKTOK_CLIENT_KEY, redirect_uri: rd, response_type: "code",
      scope: PLAT.tiktok.scopes.join(","), state: st,
    }),
  },
  x: {
    env: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
    auth: "https://x.com/i/oauth2/authorize",
    token: "https://api.x.com/2/oauth2/token",
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access", "media.write"],
    redirect: p => `${p}/api/oauth/x/callback`,
    params: (cfg, rd, st, extra) => ({
      client_id: cfg.X_CLIENT_ID, redirect_uri: rd, response_type: "code",
      scope: PLAT.x.scopes.join(" "), state: st,
      code_challenge: extra.code_challenge, code_challenge_method: "S256",
    }),
  },
};

function cfg(name) {
  const p = PLAT[name];
  if (!p) return null;
  const o = {};
  for (const k of p.env) o[k] = process.env[k] || "";
  return o;
}
function configured(name) {
  const c = cfg(name);
  return c && Object.values(c).every(Boolean);
}
function setStCookie(res, name, userId, rand, meta = {}) {
  const val = sign(JSON.stringify({ n: name, u: userId, r: rand, m: meta, t: Date.now() }));
  return `qr_${name}_st=${encodeURIComponent(val)}; Path=/api/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=900`;
}
function readStCookie(req, name) {
  const raw = req.headers.cookie || "";
  const m = raw.match(new RegExp(`(?:^|;\\s*)qr_${name}_st=([^;]+)`));
  if (!m) return null;
  try { return JSON.parse(Buffer.from(decodeURIComponent(m[1]), "base64url").toString("utf8")); } catch { return null; }
}
function stCookieValid(req, name, st) {
  const raw = req.headers.cookie || "";
  const m = raw.match(new RegExp(`(?:^|;\\s*)qr_${name}_st=([^;]+)`));
  if (!m) return false;
  const sig = decodeURIComponent(m[1]);
  return unsign(JSON.stringify({ n: st.n, u: st.u, r: st.r, m: st.m, t: st.t }), sig);
}

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

/* بدء ربط: كوكي حالة موقّع يحمل معرّف المستخدم ثم تحويل للمزوّد */
async function handleStart(req, res, name, extra = {}) {
  const p = PLAT[name];
  if (!p) return json(res, 404, { error: "unknown platform" });
  const { getUserId } = require("./sess");
  const userId = await getUserId(req);
  if (!userId) return json(res, 401, { error: "سجل الدخول أولًا" });
  if (!configured(name)) {
    res.statusCode = 302;
    res.setHeader("Location", `/#/account?setup=${name}`);
    return res.end();
  }
  const crypto = require("crypto");
  const rand = name + "." + crypto.randomBytes(16).toString("base64url");
  const meta = { ...(extra.meta || {}) };
  if (name === "x") {
    const verifier = crypto.randomBytes(48).toString("base64url");
    meta.v = verifier;
    extra.code_challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  }
  const c = cfg(name);
  const rd = p.redirect(ORIGIN());
  const params = p.params(c, rd, rand, extra);
  const url = p.auth + "?" + new URLSearchParams(params).toString();
  res.statusCode = 302;
  const cookie = setStCookie(res, name, userId, rand, meta);
  res.setHeader("Set-Cookie", cookie);
  res.setHeader("Location", url);
  res.end();
}

module.exports = { PLAT, cfg, configured, setStCookie, readStCookie, stCookieValid, json, ORIGIN, handleStart };

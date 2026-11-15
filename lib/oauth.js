/* إعدادات OAuth لكل منصة + كوكي الحالة الآمن */
const { sign, unsign } = require("./crypt");

const ORIGIN = () => process.env.SITE_ORIGIN || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

const PLAT = {
  youtube: {
    env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    auth: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scopes: ["openid", "profile", "https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"],
    redirect: p => `${p}/api/oauth/callback`,
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
    redirect: p => `${p}/api/oauth/callback`,
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
    redirect: p => `${p}/api/oauth/callback`,
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
    redirect: p => `${p}/api/oauth/callback`,
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
/* كوكي الحالة = "<الحمولة base64url>.<توقيع HMAC للحمولة>"
 * كان يُخزَّن التوقيع وحده بلا الحمولة، فكان readStCookie يعيد null دائمًا
 * وتنتهي كل محاولات الربط (يوتيوب/ميتا/تيك توك/X) بـ linked=*_err. */
const STATE_MAX_AGE_SECONDS = 900;
// A small allowance for clock differences between instances handling start and callback.
const STATE_FUTURE_SKEW_MS = 60 * 1000;
function stCookieRaw(req, name) {
  const raw = String(req.headers?.cookie || "");
  const m = raw.match(new RegExp(`(?:^|;\\s*)qr_${name}_st=([^;]+)`));
  if (!m) return "";
  try { return decodeURIComponent(m[1]); } catch { return ""; }
}
function stCookieValue(name, userId, rand, meta = {}) {
  const payload = Buffer.from(JSON.stringify({ n: name, u: userId, r: rand, m: meta, t: Date.now() }), "utf8").toString("base64url");
  return payload + "." + sign(payload);
}
function setStCookie(res, name, userId, rand, meta = {}) {
  const val = stCookieValue(name, userId, rand, meta);
  return `qr_${name}_st=${encodeURIComponent(val)}; Path=/api/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=${STATE_MAX_AGE_SECONDS}`;
}
function clearStCookie(name) {
  return `qr_${name}_st=; Path=/api/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
function readStCookie(req, name) {
  const raw = stCookieRaw(req, name);
  const bits = raw.split(".");
  if (bits.length !== 2 || !bits[0] || !bits[1]) return null; /* صيغة غير سليمة (بلا توقيع) */
  const payload = bits[0];
  try { return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { return null; }
}
function stCookieValid(req, name, st) {
  const raw = stCookieRaw(req, name);
  if (!raw || !st) return false;
  const i = raw.lastIndexOf(".");
  if (i < 1) return false;
  const payload = raw.slice(0, i), sig = raw.slice(i + 1);
  if (!sig || !unsign(payload, sig)) return false;
  try {
    const got = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    // Max-Age only instructs browsers; reject stale or malformed signed state
    // on the server too. This does not make a state nonce single-use.
    const now = Date.now();
    return got.n === name && typeof got.u === "string" && got.u.length > 0 &&
      typeof got.r === "string" && got.r.length > 0 && got.u === st.u && got.r === st.r &&
      Number.isSafeInteger(got.t) && got.t > 0 &&
      got.t <= now + STATE_FUTURE_SKEW_MS && now - got.t < STATE_MAX_AGE_SECONDS * 1000;
  } catch { return false; }
}
/* Provider IDs are opaque; never invent an ID or use the legacy placeholder. */
function validProviderId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 512 &&
    value === value.trim() && value !== "me" && !/[\u0000-\u001f\u007f]/.test(value);
}

/* سبب الفشل يعود في ?w= حتى تشرح الواجهة الخطأ بدل «أعد المحاولة» فقط */
const failUrl = (prov, why) => `/#/account?linked=${prov}_err&w=${why}`;

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
    if (req.method === "POST") return json(res, 503, { error: "ربط هذه المنصة غير مهيأ على الخادم" });
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
  const cookie = setStCookie(res, name, userId, rand, meta);
  res.setHeader("Set-Cookie", cookie);
  // New clients start with a same-origin authenticated POST; the session token
  // stays in the Authorization header, not browser history or request URLs.
  if (req.method === "POST") return json(res, 200, { url });
  res.statusCode = 302;
  /* التوكن يمرّ في ?t= لأن البدء تنقّل متصفح (لا هيدرز) — نمنع تسريبه
   * إلى المزوّد أو إلى أي طرف عبر Referer، ونمنع تخزين الرد */
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Location", url);
  res.end();
}

module.exports = { PLAT, cfg, configured, setStCookie, readStCookie, stCookieValid, clearStCookie, stCookieValue, json, ORIGIN, handleStart, failUrl, validProviderId };

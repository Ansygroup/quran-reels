// YouTube account linking for the Cloudflare worker (free tier): Firebase sign-in check, Google OAuth,
// encrypted tokens in Workers KV, and a short-lived access token for the browser to upload with.
// Autopilot (daily render + post) needs headless Chrome, which Workers do not have, so it is read-only here.
const PROJECT = "booming-banner-477420-h3";
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];
const AAQIB = { id: "aaqib-azeez-murattal", name: "عاقب عزيز" };
const enc = new TextEncoder();
const dec = new TextDecoder();

const b64u = {
  enc: (buf) => { const a = new Uint8Array(buf); let s = ""; for (const x of a) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); },
  dec: (str) => { const s = atob(String(str).replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(String(str).length / 4) * 4, "=")); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; },
};
const json = (status, obj, extra) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...(extra || {}) } });

/* ---------- Firebase ID token (RS256 via Google's JWKS) ---------- */
let jwks = null, jwksAt = 0;
async function firebaseKey(kid) {
  if (!jwks || Date.now() - jwksAt > 3600e3 || !jwks.keys.some(k => k.kid === kid)) {
    const r = await fetch(JWKS_URL, { cf: { cacheTtl: 3600, cacheEverything: true } });
    if (!r.ok) throw new Error("jwks");
    jwks = await r.json(); jwksAt = Date.now();
  }
  const jwk = jwks.keys.find(k => k.kid === kid);
  if (!jwk) throw new Error("unknown kid");
  return crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
}
export async function verifyFirebase(token, project = PROJECT) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return null;
    const header = JSON.parse(dec.decode(b64u.dec(parts[0])));
    const p = JSON.parse(dec.decode(b64u.dec(parts[1])));
    if (header.alg !== "RS256" || !header.kid) return null;
    const now = Date.now();
    if (!p.exp || p.exp * 1000 < now) return null;
    if (p.iat && p.iat * 1000 > now + 5 * 60e3) return null;
    if (p.aud !== project || p.iss !== "https://securetoken.google.com/" + project) return null;
    if (typeof p.sub !== "string" || !p.sub || p.sub.length > 128) return null;
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", await firebaseKey(header.kid), b64u.dec(parts[2]), enc.encode(parts[0] + "." + parts[1]));
    return ok ? { uid: p.sub, email: p.email || "" } : null;
  } catch { return null; }
}
async function userFrom(request, url) {
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "");
  const t = m ? m[1] : (request.method === "GET" ? url.searchParams.get("t") : "");
  return verifyFirebase(t);
}

/* ---------- AES-GCM for stored tokens, HMAC for the OAuth state cookie ---------- */
function keyBytes(env) {
  const raw = b64u.dec(String(env.TOKEN_ENC_KEY || "").replace(/\s+/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
  if (raw.length !== 32) throw new Error("TOKEN_ENC_KEY must be 32 bytes");
  return raw;
}
const aesKey = (env) => crypto.subtle.importKey("raw", keyBytes(env), "AES-GCM", false, ["encrypt", "decrypt"]);
async function seal(env, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(env), enc.encode(text));
  return b64u.enc(iv) + "." + b64u.enc(ct);
}
async function open(env, sealed) {
  const [iv, ct] = String(sealed || "").split(".");
  if (!iv || !ct) return "";
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64u.dec(iv) }, await aesKey(env), b64u.dec(ct));
  return dec.decode(pt);
}
async function hmac(env, data) {
  const k = await crypto.subtle.importKey("raw", keyBytes(env), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return b64u.enc(await crypto.subtle.sign("HMAC", k, enc.encode("state:" + data)));
}
const ST_COOKIE = "qr_youtube_st";
async function stateCookie(env, uid, rand) {
  const payload = b64u.enc(enc.encode(JSON.stringify({ u: uid, r: rand, t: Date.now() })));
  return `${ST_COOKIE}=${payload}.${await hmac(env, payload)}; Max-Age=900; Path=/api/oauth; HttpOnly; Secure; SameSite=Lax`;
}
async function readState(env, request) {
  const m = new RegExp("(?:^|;\\s*)" + ST_COOKIE + "=([^;]+)").exec(request.headers.get("cookie") || "");
  if (!m) return null;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig || (await hmac(env, payload)) !== sig) return null;
  try {
    const s = JSON.parse(dec.decode(b64u.dec(payload)));
    if (Date.now() - s.t > 900e3 || s.t - Date.now() > 60e3) return null;
    return s;
  } catch { return null; }
}

/* ---------- KV records: one value per Firebase user ---------- */
const kvKey = (uid) => "u:" + uid;
async function load(env, uid) { const v = await env.KV.get(kvKey(uid), "json"); return v && Array.isArray(v.conns) ? v : { conns: [] }; }
const save = (env, uid, rec) => env.KV.put(kvKey(uid), JSON.stringify(rec));
const publicConn = (c) => ({ id: c.id, platform: "youtube", account_name: c.account_name, extra: { channel: c.account_name }, scopes: SCOPES.join(" "), expires_at: c.expires_at, updated_at: c.updated_at, is_default: !!c.is_default, has_refresh: !!c.refresh });

function origin(url) { return url.origin; }
const redirectUri = (url) => origin(url) + "/api/oauth/callback";
const ready = (env) => !!(env.KV && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.TOKEN_ENC_KEY);
const back = (to, extra) => new Response(null, { status: 302, headers: { location: to, "cache-control": "no-store", ...(extra || {}) } });
const clearState = `${ST_COOKIE}=; Max-Age=0; Path=/api/oauth; HttpOnly; Secure; SameSite=Lax`;

async function start(request, env, url) {
  const u = await userFrom(request, url);
  if (!u) return json(401, { error: "سجل الدخول أولًا" });
  const p = url.searchParams.get("p") || "youtube";
  if (p !== "youtube") return json(403, { error: "هذه المنصة غير متاحة حاليًا" });
  if (!ready(env)) return json(503, { error: "ربط يوتيوب غير مهيأ على الخادم" });
  const rand = "youtube." + b64u.enc(crypto.getRandomValues(new Uint8Array(16)));
  const params = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(url), response_type: "code", scope: SCOPES.join(" "), state: rand, access_type: "offline", prompt: "consent", include_granted_scopes: "true" });
  const target = AUTH_URL + "?" + params;
  const cookie = await stateCookie(env, u.uid, rand);
  if (request.method === "POST") return json(200, { url: target }, { "set-cookie": cookie });
  return new Response(null, { status: 302, headers: { location: target, "set-cookie": cookie, "referrer-policy": "no-referrer", "cache-control": "no-store" } });
}

async function callback(request, env, url) {
  const fail = (why) => back("/#/account?linked=youtube_err&reason=" + why, { "set-cookie": clearState });
  if (url.searchParams.get("error")) return fail("denied");
  const code = url.searchParams.get("code"), st = url.searchParams.get("state");
  if (!code || !st) return fail("no_code");
  if (!ready(env)) return fail("setup");
  const saved = await readState(env, request);
  if (!saved || saved.r !== st) return fail("state");
  let j;
  try {
    const r = await fetch(TOKEN_URL, { method: "POST", redirect: "error", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri(url), grant_type: "authorization_code" }) });
    j = await r.json();
    if (!r.ok || !j.access_token) return fail("token");
  } catch { return fail("token"); }
  let item;
  try {
    const r = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { redirect: "error", headers: { authorization: "Bearer " + j.access_token } });
    const ch = await r.json();
    item = r.ok && Array.isArray(ch.items) ? ch.items[0] : null;
  } catch { item = null; }
  if (!item || !/^[A-Za-z0-9_-]{10,64}$/.test(item.id || "")) return fail("channel");
  const rec = await load(env, saved.u);
  const old = rec.conns.find(c => c.account_id === item.id);
  const conn = {
    id: old ? old.id : crypto.randomUUID(), account_id: item.id, account_name: item.snippet?.title || "قناة يوتيوب",
    access: await seal(env, j.access_token), refresh: j.refresh_token ? await seal(env, j.refresh_token) : (old ? old.refresh : ""),
    expires_at: Date.now() + (Number(j.expires_in) || 3600) * 1000, updated_at: new Date().toISOString(), is_default: old ? old.is_default : rec.conns.length === 0,
  };
  rec.conns = rec.conns.filter(c => c.account_id !== item.id).concat(conn);
  if (!rec.conns.some(c => c.is_default)) rec.conns[0].is_default = true;
  try { await save(env, saved.u, rec); } catch { return fail("store"); }
  return back("/#/account?linked=youtube", { "set-cookie": clearState });
}

async function freshToken(env, uid, id) {
  const rec = await load(env, uid);
  const c = id ? rec.conns.find(x => x.id === id) : (rec.conns.find(x => x.is_default) || rec.conns[0]);
  if (!c) return { status: 404, error: "لا توجد قناة مرتبطة" };
  if (c.expires_at > Date.now() + 90e3) return { conn: c, token: await open(env, c.access) };
  if (!c.refresh) return { status: 409, error: "انتهى الربط؛ أعد ربط القناة" };
  const r = await fetch(TOKEN_URL, { method: "POST", redirect: "error", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: await open(env, c.refresh), grant_type: "refresh_token" }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) return { status: j.error === "invalid_grant" ? 409 : 502, error: j.error === "invalid_grant" ? "انتهى الربط؛ أعد ربط القناة" : "تعذّر تجديد الجلسة" };
  c.access = await seal(env, j.access_token);
  c.expires_at = Date.now() + (Number(j.expires_in) || 3600) * 1000;
  c.updated_at = new Date().toISOString();
  await save(env, uid, rec);
  return { conn: c, token: j.access_token };
}

async function body(request) { try { return await request.json(); } catch { return {}; } }

async function gw(request, env, url) {
  const op = url.searchParams.get("op") || "";
  if (op === "version") return json(200, { ok: true, service: "quran-reels", runtime: "cloudflare-worker", now: new Date().toISOString() });
  if (op === "start") return start(request, env, url);
  const u = await userFrom(request, url);
  if (!u) return json(401, { error: "unauthorized" });
  if (!env.KV) return json(503, { error: "unavailable", code: "unavailable" });
  if (op === "list") {
    if (request.method !== "GET") return json(405, { error: "method" });
    return json(200, { connections: (await load(env, u.uid)).conns.map(publicConn) });
  }
  if (request.method !== "POST") return json(405, { error: "method" });
  const b = await body(request);
  const rec = await load(env, u.uid);
  if (op === "default") {
    if (!rec.conns.some(c => c.id === b.id)) return json(404, { error: "القناة غير موجودة" });
    rec.conns.forEach(c => { c.is_default = c.id === b.id; });
    await save(env, u.uid, rec);
    return json(200, { ok: true });
  }
  if (op === "disconnect") {
    const c = rec.conns.find(x => x.id === b.id);
    if (!c) return json(404, { error: "القناة غير موجودة" });
    try { // revoke at Google, best effort
      const t = c.refresh ? await open(env, c.refresh) : await open(env, c.access);
      await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: t }) });
    } catch {}
    rec.conns = rec.conns.filter(x => x.id !== b.id);
    if (rec.conns.length && !rec.conns.some(x => x.is_default)) rec.conns[0].is_default = true;
    await save(env, u.uid, rec);
    return json(200, { ok: true, deleted: true });
  }
  return json(404, { error: "unknown op", ops: ["start", "list", "default", "disconnect", "version"] });
}

/* GET: read-only account view. POST: autopilot cannot run on Workers, so settings are refused. */
async function autopilot(request, env, url) {
  const u = await userFrom(request, url);
  if (!u) return json(401, { error: "سجّل الدخول أولًا" });
  if (request.method !== "GET") return json(503, { error: "التشغيل التلقائي غير متاح على هذه الاستضافة حاليًا؛ انشر من الصانع مباشرة.", code: "unavailable" });
  const conns = env.KV ? (await load(env, u.uid)).conns : [];
  return json(200, {
    config: { enabled: false, settings_revision: null, at_utc: "04:15:00", platforms: ["youtube"], all_channels: false, template: { content_mode: "mix", reciter_mode: "fixed", reciter: AAQIB.id, background: "rotate", privacy: "public" } },
    runs: [], runs_available: true, connected: conns.length > 0, platforms: conns.length ? ["youtube"] : [],
    channel: conns.map(c => c.account_name).join("، ") || "لا توجد قنوات مرتبطة",
    reciters: [AAQIB],
    available: [{ key: "youtube", name: "يوتيوب", publish: true, connect: "youtube", ready: ready(env) }, { key: "facebook", name: "فيسبوك", publish: false, connect: null, ready: false }, { key: "instagram", name: "إنستغرام", publish: false, connect: null, ready: false }, { key: "tiktok", name: "تيك توك", publish: false, connect: null, ready: false }],
    articles: { count: 0 }, last_check: null, last_daily: null, reauth: [], stats: {}, failed_review: [], pending_review: [],
    options: { content_modes: ["mix"], backgrounds: ["rotate"], reciters: [AAQIB], autopilot_available: false },
  });
}

export async function handleYt(request, env, url, p) {
  if (p === "/api/gw" || p === "/api/oauth" || p === "/api/social") return gw(request, env, url);
  if (p === "/api/oauth/callback") return callback(request, env, url);
  if (p === "/api/autopilot") return autopilot(request, env, url);
  if (p === "/api/youtube/token") {
    const u = await userFrom(request, url);
    if (!u) return json(401, { error: "سجّل الدخول أولًا" });
    if (!ready(env)) return json(503, { error: "unavailable" });
    const b = request.method === "POST" ? await body(request) : {};
    const r = await freshToken(env, u.uid, b.id || url.searchParams.get("id") || "");
    if (!r.token) return json(r.status || 500, { error: r.error });
    return json(200, { access_token: r.token, expires_at: r.conn.expires_at, channel: r.conn.account_name, channel_id: r.conn.account_id });
  }
  return null;
}

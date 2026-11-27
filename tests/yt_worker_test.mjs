/* Worker YouTube linking: Firebase token check, OAuth start/callback state, KV storage, list/default/disconnect, token refresh. */
import { verifyFirebase, handleYt } from "../src/yt.js";
const bad = [];
const ok = (c, m) => { if (!c) bad.push(m); };
const b64u = (b) => Buffer.from(b).toString("base64url");
const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", kp.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
async function tok(over = {}, key = kp.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({ alg: "RS256", kid: "k1" }));
  const p = b64u(JSON.stringify({ iss: "https://securetoken.google.com/booming-banner-477420-h3", aud: "booming-banner-477420-h3", sub: "uidA", iat: now - 5, exp: now + 3600, ...over }));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(h + "." + p));
  return h + "." + p + "." + b64u(sig);
}
const calls = [];
let ytItems = [{ id: "UCabcdefghijklmnopqrst", snippet: { title: "قناتي" } }];
globalThis.fetch = async (u, o = {}) => {
  u = String(u); calls.push(u);
  if (u.includes("securetoken@system")) return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
  if (u.startsWith("https://oauth2.googleapis.com/token")) {
    const g = new URLSearchParams(o.body).get("grant_type");
    return new Response(JSON.stringify(g === "refresh_token" ? { access_token: "ACC2", expires_in: 3600 } : { access_token: "ACC1", refresh_token: "REF1", expires_in: 3600 }), { status: 200 });
  }
  if (u.includes("youtube/v3/channels")) return new Response(JSON.stringify({ items: ytItems }), { status: 200 });
  if (u.includes("/revoke")) return new Response("{}", { status: 200 });
  return new Response("{}", { status: 404 });
};
const store = new Map();
const env = { KV: { get: async (k, t) => store.has(k) ? JSON.parse(store.get(k)) : null, put: async (k, v) => { store.set(k, v); } }, GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "sec", TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString("base64") };
const site = "https://quranreels.chatora.us.ci";
const req = (path, method = "GET", token, body, cookie) => { const u = new URL(site + path); return [new Request(u, { method, body: body ? JSON.stringify(body) : undefined, headers: { ...(token ? { authorization: "Bearer " + token } : {}), ...(cookie ? { cookie } : {}) } }), u]; };
const call = async (path, method, token, body, cookie) => { const [r, u] = req(path, method, token, body, cookie); return handleYt(r, env, u, u.pathname); };

ok(await verifyFirebase(await tok()), "valid token rejected");
ok(!(await verifyFirebase(await tok({ exp: 1 }))), "expired accepted");
ok(!(await verifyFirebase(await tok({ aud: "x" }))), "wrong aud accepted");
ok(!(await verifyFirebase(await tok({ iss: "https://securetoken.google.com/x" }))), "wrong iss accepted");
const other = (await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])).privateKey;
ok(!(await verifyFirebase(await tok({}, other))), "forged signature accepted");
ok(!(await verifyFirebase("a.b.c")), "garbage accepted");

const T = await tok();
ok((await call("/api/gw?op=list", "GET")).status === 401, "list without token should be 401");
let r = await call("/api/gw?op=start&p=youtube", "POST", T);
const st = await r.json(); const cookie = r.headers.get("set-cookie");
ok(r.status === 200 && new URL(st.url).hostname === "accounts.google.com", "start should return a google url");
ok(new URL(st.url).searchParams.get("redirect_uri") === site + "/api/oauth/callback", "redirect uri");
ok(/HttpOnly/.test(cookie) && /Secure/.test(cookie), "state cookie flags");
ok((await call("/api/gw?op=start&p=tiktok", "POST", T)).status === 403, "tiktok should be refused");
const state = new URL(st.url).searchParams.get("state");
const ck = cookie.split(";")[0];
r = await call("/api/oauth/callback?code=abc&state=WRONG", "GET", null, null, ck);
ok(/linked=youtube_err&reason=state/.test(r.headers.get("location")), "wrong state should fail");
r = await call("/api/oauth/callback?code=abc&state=" + state, "GET", null, null, "");
ok(/reason=state/.test(r.headers.get("location")), "missing cookie should fail");
r = await call("/api/oauth/callback?code=abc&state=" + encodeURIComponent(state), "GET", null, null, ck);
ok(r.headers.get("location") === "/#/account?linked=youtube", "callback should link: " + r.headers.get("location"));
const raw = [...store.values()].join("");
ok(!raw.includes("ACC1") && !raw.includes("REF1"), "tokens must be encrypted in KV");
r = await call("/api/gw?op=list", "GET", T); const list = await r.json();
ok(list.connections.length === 1 && list.connections[0].is_default && list.connections[0].has_refresh && !JSON.stringify(list).includes("ACC1"), "list shape");
const id = list.connections[0].id;
r = await call("/api/youtube/token", "POST", T, { id }); const tk = await r.json();
ok(tk.access_token === "ACC1", "token endpoint should return stored access token");
const rec = JSON.parse(store.get("u:uidA")); rec.conns[0].expires_at = Date.now() - 1000; store.set("u:uidA", JSON.stringify(rec));
r = await call("/api/youtube/token", "POST", T, { id }); ok((await r.json()).access_token === "ACC2", "expired token should refresh");
ok((await call("/api/youtube/token", "POST", await tok({ sub: "uidB" }), { id })).status === 404, "other user must not reach this channel");
r = await call("/api/autopilot", "GET", T); const ap = await r.json();
ok(ap.config.enabled === false && ap.reciters.length === 1 && ap.reciters[0].id === "aaqib-azeez-murattal" && ap.config.template.reciter === "aaqib-azeez-murattal" && ap.connected === true, "autopilot view");
ok((await call("/api/autopilot", "POST", T, { enabled: true })).status === 503, "autopilot write must be refused");
r = await call("/api/gw?op=disconnect", "POST", T, { id }); const d = await r.json();
ok(d.ok === true && d.deleted === true, "disconnect shape");
ok((await (await call("/api/gw?op=list", "GET", T)).json()).connections.length === 0, "list after disconnect");
if (bad.length) { console.error("FAIL", bad); process.exit(1); }
console.log("YT worker PASS (" + 26 + " checks)");

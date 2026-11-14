#!/usr/bin/env node
/* OAuth حقيقي + مترجم SQL + نشر يوتيوب بشبكة PostgREST ومزوّد محاكاة. */
const assert = require("node:assert/strict");
const Module = require("module"), load = Module._load;
Module._load = function (id) { if (["@sparticuz/chromium", "playwright-core", "playwright"].includes(id)) return {}; return load.apply(this, arguments); };
process.env.SUPABASE_URL = "https://db.example";
process.env.SUPABASE_SERVICE_KEY = "test";
process.env.SITE_ORIGIN = "https://example.test";
process.env.TOKEN_ENC_KEY = "test";
process.env.GOOGLE_CLIENT_ID = "client"; process.env.GOOGLE_CLIENT_SECRET = "secret";
const { seal, open } = require("../lib/crypt");
const oauth = require("../lib/oauth");
const callback = require("../lib/cb_youtube");
const { resumeAfterRelink } = require("../lib/relink_resume");
let tables, uploads, requests, failReads, switchDefaultAtClaim, grantRefresh, channelId, failPrevious;
const iso = new Date(Date.now() - 1000).toISOString();
function reset() {
  uploads = 0; requests = []; failReads = false; switchDefaultAtClaim = false; grantRefresh = "new-refresh"; channelId = "UC1"; failPrevious = false;
  tables = {
    autopilot: [{ user_id: "u1", enabled: true, platforms: ["youtube"] }],
    social_connections: [{ id: "c1", user_id: "u1", platform: "youtube", account_id: "UC1", is_default: true, access_token: seal("old"), refresh_token: seal("r"), expires_at: 1, updated_at: iso }],
    publish_queue: [{ id: "q1", user_id: "u1", platform: "youtube", connection_id: null, video_path: "u1/autopilot/2026-11-12-one.mp4", video_name: "one.mp4", status: "failed", error: "تجديد التوكن فشل (youtube): invalid_grant", publish_at: iso, created_at: iso, updated_at: iso }],
    system_checks: [{ kind: "reauth_needed", detail: { connection_id: "c1" }, created_at: iso }], autopilot_runs: [{ user_id: "u1", run_date: "2026-11-12", status: "failed" }],
  };
}
function result(data) { return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => data, text: async () => "" }; }
function match(row, params) {
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "on_conflict"].includes(key)) continue;
    let val = key === "detail->>connection_id" ? row.detail?.connection_id : row[key];
    if (raw.startsWith("eq.") && String(val) !== raw.slice(3)) return false;
    if (raw.startsWith("neq.") && String(val) === raw.slice(4)) return false;
    if (raw.startsWith("is.null") && val != null) return false;
    if (raw.startsWith("in.")) { const options = raw.slice(4, -1).split(",").map(x => x.replace(/^"|"$/g, "")); if (!options.includes(String(val))) return false; }
    if (/^(?:i?like)\./.test(raw)) {
      const patt = raw.slice(raw.indexOf(".") + 1).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      if (!new RegExp(`^${patt}$`, raw.startsWith("ilike") ? "i" : "").test(String(val || ""))) return false;
    }
  }
  return true;
}
global.fetch = async (url, opts = {}) => {
  const u = new URL(url), method = opts.method || "GET";
  requests.push({ url: u, method });
  if (u.hostname === "oauth2.googleapis.com") return result({ access_token: "fresh", refresh_token: grantRefresh, expires_in: 3600 });
  if (u.hostname === "www.googleapis.com" && u.pathname.includes("/channels")) return result({ items: [{ id: channelId, snippet: { title: "test" } }] });
  if (u.hostname === "www.googleapis.com" && u.pathname.includes("/upload/") && method === "POST") return { ok: true, headers: { get: () => "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=fixture" } };
  if (u.hostname === "www.googleapis.com" && u.pathname.includes("/upload/") && method === "PUT") { uploads++; return result({ id: "vid1" }); }
  if (u.hostname === "db.example" && u.pathname.startsWith("/storage/")) return method === "HEAD" ? { ok: true, headers: { get: () => "4" } } : { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1,2,3,4]).buffer };
  if (u.hostname !== "db.example") throw new Error("unexpected " + url);
  if (u.pathname.endsWith('/rpc/link_autopilot_platform_guarded')) {
    const body=JSON.parse(opts.body); let row=tables.autopilot.find(r=>r.user_id===body.p_user_id);
    if (!row) { tables.autopilot.push({user_id:body.p_user_id,enabled:true,platforms:[body.p_platform]}); return result('created'); }
    if (!row.platforms.includes(body.p_platform)) { row.platforms.push(body.p_platform); return result('extended'); }
    return result('unchanged');
  }
  const name = u.pathname.split("/").at(-1);
  if (!tables[name]) throw new Error("table " + name);
  if (failReads && method === "GET" && name === "publish_queue") throw new Error("DB unavailable");
  if (failPrevious && method === "GET" && name === "social_connections") throw new Error("DB unavailable");
  let selected = tables[name].filter(r => match(r, u.searchParams));
  const order = u.searchParams.get("order") || "";
  if (order.includes("created_at.desc")) selected.sort((a,b) => String(b.created_at).localeCompare(String(a.created_at)));
  if (order.includes("publish_at.asc")) selected.sort((a,b) => String(a.publish_at).localeCompare(String(b.publish_at)) || String(a.id).localeCompare(String(b.id)));
  const lim = Number(u.searchParams.get("limit") || selected.length); selected = selected.slice(0, lim);
  if (method === "PATCH") {
    const body = JSON.parse(opts.body); selected.forEach(r => Object.assign(r, body));
    if (name === "publish_queue" && body.status === "publishing" && switchDefaultAtClaim) {
      tables.social_connections[0].is_default = false;
      tables.social_connections.push({ ...tables.social_connections[0], id: "c2", account_id: "UC2", is_default: true });
    }
  }
  if (method === "POST" && name === "social_connections") { const body = JSON.parse(opts.body); let row = tables.social_connections.find(r => r.user_id === body.user_id && r.platform === body.platform && r.account_id === body.account_id); if (row) Object.assign(row, body); else { row = { id: "new", ...body }; tables.social_connections.push(row); } selected = [row]; }
  return result(selected.map(r => ({ ...r })));
};
function response() { return { headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end() {} }; }
async function link() {
  const out = response(); const cookie = oauth.setStCookie(out, "youtube", "u1", "youtube.state", {}).split(";")[0];
  const res = response(); await callback({ url: "/api/oauth/callback?code=abc&state=youtube.state", headers: { cookie } }, res); return res.headers.location;
}
(async () => {
  reset(); const linkResult = await link();
  assert.match(linkResult, /linked=youtube/); assert.doesNotMatch(linkResult, /auto_resume/); assert.equal(uploads, 0); assert.equal(tables.publish_queue[0].status, "failed"); assert.equal(tables.autopilot_runs[0].status, "failed");
  assert(!requests.some(x => x.url.pathname.endsWith('/publish_queue') && x.method === 'PATCH'), 'relink must not claim old jobs');
  reset(); tables.autopilot[0].platforms = ["youtube", "tiktok"]; await link(); assert.equal(uploads, 0); assert.equal(tables.autopilot_runs[0].status, "failed");
  reset(); tables.autopilot[0].all_channels = true; await link(); assert.equal(uploads, 0); assert.equal(tables.autopilot_runs[0].status, "failed");
  reset(); tables.autopilot[0].enabled = false; await link(); assert.equal(uploads, 0); assert.equal(tables.autopilot[0].enabled, false);
  reset(); tables.publish_queue[0].error = "network timeout invalid_grant"; await link(); assert.equal(uploads, 0);
  reset(); tables.system_checks = []; await link(); assert.equal(uploads, 0);
  reset(); tables.publish_queue.push({ ...tables.publish_queue[0], id: "q2", status: "published" }); await link(); assert.equal(uploads, 0);
  reset(); tables.publish_queue.push({ ...tables.publish_queue[0], id: "q2" }); await link(); assert.equal(uploads, 0);
  reset(); switchDefaultAtClaim = true; assert.match(await link(), /linked=youtube/); assert.equal(uploads, 0);
  reset(); tables.publish_queue.push({ ...tables.publish_queue[0], id: "q2", error: "network timeout" }); await link(); assert.equal(uploads, 0);
  reset(); tables.publish_queue[0].user_id = "other"; await link(); assert.equal(uploads, 0);
  reset(); tables.publish_queue[0].connection_id = "other-channel"; await link(); assert.equal(uploads, 0);
  reset(); tables.autopilot[0].platforms = ["tiktok"]; assert.equal((await resumeAfterRelink("u1", "youtube", "UC1")).status, "review_required"); assert.equal(uploads, 0);
  reset(); failReads = true; assert.match(await link(), /linked=youtube/); assert.equal(uploads, 0);
  // جوجل قد تحذف refresh_token من الرد؛ يبقى توكن نفس القناة ولا تُحذف صلاحيته.
  reset(); tables.autopilot[0].enabled = false; grantRefresh = undefined;
  const oldToken = tables.social_connections[0].refresh_token;
  await link(); assert.equal(tables.social_connections[0].refresh_token, oldToken); assert.equal(open(oldToken), "r");
  assert(tables.social_connections[0].expires_at > Date.now() + 3500000);
  reset(); grantRefresh = undefined; tables.social_connections = []; await link();
  assert.equal(tables.social_connections[0].refresh_token, ""); assert(tables.social_connections[0].expires_at > Date.now() + 3500000);
  reset(); channelId = null; assert.match(await link(), /linked=youtube_err.*w=channel/); assert.equal(open(tables.social_connections[0].access_token), "old");
  reset(); grantRefresh = undefined; failPrevious = true;
  const oldConsoleError = console.error; console.error = () => {}; // Expected synthetic lookup failure.
  try { assert.match(await link(), /linked=youtube_err.*w=store/); } finally { console.error = oldConsoleError; }
  assert.equal(open(tables.social_connections[0].access_token), "old");
  reset(); tables.autopilot[0].enabled = false; channelId = "UC2";
  tables.social_connections.push({ ...tables.social_connections[0], id: "c2", account_id: "UC2", is_default: false });
  assert.match(await link(), /channel=nondefault/); assert.equal(tables.social_connections[0].is_default, true); assert.equal(tables.social_connections[1].is_default, false);

  reset(); requests=[]; const vals = await Promise.all([resumeAfterRelink("u1", "youtube", "UC1"), resumeAfterRelink("u1", "youtube", "UC1")]);
  assert.equal(uploads, 0); assert(vals.every(v => v.status === "review_required")); assert.equal(requests.length,0,'legacy entry point performs no network calls');
  console.log("ALL OK: mock OAuth relink preserves credentials and never retries failed jobs");
})().catch(e => { console.error(e); process.exitCode = 1; });

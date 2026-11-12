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
const { seal } = require("../lib/crypt");
const oauth = require("../lib/oauth");
const callback = require("../lib/cb_youtube");
const { resumeAfterRelink } = require("../lib/relink_resume");
let tables, uploads, requests, failReads, switchDefaultAtClaim;
const iso = new Date(Date.now() - 1000).toISOString();
function reset() {
  uploads = 0; requests = []; failReads = false; switchDefaultAtClaim = false;
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
  if (u.hostname === "oauth2.googleapis.com") return result({ access_token: "fresh", refresh_token: "new-refresh", expires_in: 3600 });
  if (u.hostname === "www.googleapis.com" && u.pathname.includes("/channels")) return result({ items: [{ id: "UC1", snippet: { title: "test" } }] });
  if (u.hostname === "www.googleapis.com" && u.pathname.includes("/upload/")) return { ok: true, headers: { get: () => "https://upload.example/session" } };
  if (u.hostname === "upload.example") { uploads++; return result({ id: "vid1" }); }
  if (u.hostname === "db.example" && u.pathname.startsWith("/storage/")) return method === "HEAD" ? { ok: true, headers: { get: () => "4" } } : { ok: true, arrayBuffer: async () => new Uint8Array([1,2,3,4]).buffer };
  if (u.hostname !== "db.example") throw new Error("unexpected " + url);
  const name = u.pathname.split("/").at(-1);
  if (!tables[name]) throw new Error("table " + name);
  if (failReads && method === "GET" && name === "publish_queue") throw new Error("DB unavailable");
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
  if (method === "POST" && name === "social_connections") { const body = JSON.parse(opts.body); const row = tables.social_connections.find(r => r.user_id === body.user_id && r.platform === body.platform && r.account_id === body.account_id); if (row) Object.assign(row, body); else tables.social_connections.push({ id: "new", ...body }); selected = row ? [row] : []; }
  return result(selected.map(r => ({ ...r })));
};
function response() { return { headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end() {} }; }
async function link() {
  const out = response(); const cookie = oauth.setStCookie(out, "youtube", "u1", "youtube.state", {}).split(";")[0];
  const res = response(); await callback({ url: "/api/oauth/callback?code=abc&state=youtube.state", headers: { cookie } }, res); return res.headers.location;
}
(async () => {
  reset(); const linkResult = await link();
  assert.match(linkResult, /auto_resume=published/); assert.equal(uploads, 1); assert.equal(tables.publish_queue[0].status, "published"); assert.equal(tables.autopilot_runs[0].status, "published");
  assert(requests.some(x => x.url.searchParams.get("user_id") === "eq.u1" && x.url.searchParams.get("status") === "eq.failed" && x.method === "PATCH"));
  reset(); tables.autopilot[0].platforms = ["youtube", "tiktok"]; await link(); assert.equal(uploads, 1); assert.equal(tables.autopilot_runs[0].status, "failed");
  reset(); tables.autopilot[0].all_channels = true; await link(); assert.equal(uploads, 1); assert.equal(tables.autopilot_runs[0].status, "failed");
  reset(); tables.autopilot[0].enabled = false; await link(); assert.equal(uploads, 0); assert.equal(tables.autopilot[0].enabled, false);
  reset(); tables.publish_queue[0].error = "network timeout invalid_grant"; await link(); assert.equal(uploads, 0);
  reset(); tables.system_checks = []; await link(); assert.equal(uploads, 0);
  reset(); tables.publish_queue.push({ ...tables.publish_queue[0], id: "q2", status: "published" }); await link(); assert.equal(uploads, 0);
  reset(); tables.publish_queue.push({ ...tables.publish_queue[0], id: "q2" }); await link(); assert.equal(uploads, 0);
  reset(); switchDefaultAtClaim = true; assert.match(await link(), /auto_resume=failed/); assert.equal(uploads, 0);
  reset(); tables.publish_queue.push({ ...tables.publish_queue[0], id: "q2", error: "network timeout" }); await link(); assert.equal(uploads, 0);
  reset(); tables.publish_queue[0].user_id = "other"; await link(); assert.equal(uploads, 0);
  reset(); tables.publish_queue[0].connection_id = "other-channel"; await link(); assert.equal(uploads, 0);
  reset(); tables.autopilot[0].platforms = ["tiktok"]; assert.equal((await resumeAfterRelink("u1", "youtube", "UC1")).status, "skipped"); assert.equal(uploads, 0);
  reset(); failReads = true; assert.match(await link(), /auto_resume=failed/); assert.equal(uploads, 0);
  reset(); const vals = await Promise.all([resumeAfterRelink("u1", "youtube", "UC1"), resumeAfterRelink("u1", "youtube", "UC1")]);
  assert.equal(uploads, 1); assert.equal(vals.filter(v => v.status === "published").length, 1);
  console.log("ALL OK: ربط OAuth ⇒ رفع تلقائي واحد؛ الإيقاف والغموض والمستخدم الآخر وفشل القاعدة تمنع الرفع");
})().catch(e => { console.error(e); process.exitCode = 1; });

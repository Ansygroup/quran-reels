#!/usr/bin/env node
/* تنافس كرون وزر النشر على صف واحد: قاعدة PostgREST محاكاة ومترجم SQL حقيقي. */
const assert = require("node:assert/strict");
process.env.TOKEN_ENC_KEY = "claim-test";
process.env.SUPABASE_URL = "https://db.example";
process.env.SUPABASE_SERVICE_KEY = "test";
const { seal } = require("../lib/crypt");
const row = { id: "q1", user_id: "u1", platform: "youtube", connection_id: null, status: "scheduled", video_path: "u1/v.mp4", title: "عنوان" };
let uploads = 0, claims = 0;
const filters = [];
const conn = { id: "c1", user_id: "u1", platform: "youtube", access_token: seal("access"), refresh_token: seal("refresh"), expires_at: Date.now() + 3600000 };
function json(data) { return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => data, text: async () => "" }; }
global.fetch = async (url, opts = {}) => {
  const u = new URL(url), method = opts.method || "GET";
  if (u.hostname === "db.example" && u.pathname === "/rest/v1/publish_queue" && method === "PATCH") {
    const body = JSON.parse(opts.body); filters.push(u.searchParams.toString());
    if (u.searchParams.get("id") !== `eq.${row.id}` || (u.searchParams.has("user_id") && u.searchParams.get("user_id") !== `eq.${row.user_id}`) || (u.searchParams.has("status") && u.searchParams.get("status") !== `eq.${row.status}`) || (u.searchParams.has("platform") && u.searchParams.get("platform") !== `eq.${row.platform}`) || (u.searchParams.has("connection_id") && u.searchParams.get("connection_id") !== (row.connection_id===null?'is.null':`eq.${row.connection_id}`))) return json([]);
    Object.assign(row, body); if (body.status === "publishing") claims++;
    return json([{ ...row }]);
  }
  if (u.hostname === "db.example" && u.pathname === "/rest/v1/social_connections") return json([conn]);
  if (u.hostname === "db.example" && u.pathname.startsWith("/storage/")) {
    if (method === "HEAD") return { ok: true, headers: { get: () => "4" } };
    return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer };
  }
  if (u.hostname === "www.googleapis.com" && method === "POST") return { ok: true, headers: { get: () => "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=fixture" } };
  if (u.hostname === "www.googleapis.com" && method === "PUT") { uploads++; return json({ id: "video1" }); }
  throw new Error(`unexpected request ${method} ${url}`);
};
(async () => {
  const { publishRow } = require("../lib/publish");
  const snapshot = { ...row };
  const [a, b] = await Promise.all([publishRow(snapshot), publishRow(snapshot)]);
  assert.equal(claims, 1);
  assert.equal(uploads, 1);
  assert.equal([a, b].filter(r => r.ok).length, 1);
  assert.equal([a, b].filter(r => r.skipped === "already-claimed").length, 1);
  assert.equal(row.status, "published");
  assert(filters.some(f => /status=eq.scheduled/.test(decodeURIComponent(f)) && /user_id=eq.u1/.test(decodeURIComponent(f))));
  const before = uploads;
  const again = await publishRow(snapshot);
  assert.equal(again.ok, false);
  assert.equal(uploads, before);
  const unsafe = await publishRow({ ...snapshot, status: "publishing" });
  assert.equal(unsafe.skipped, "not-claimable");
  const numFilters=filters.length;
  const uncertain = await publishRow({ ...snapshot, status: "failed" });
  assert.equal(uncertain.skipped, "review-required");
  const relinkRetry = await publishRow({ ...snapshot, status: "failed" }, 'youtube', {expectedConnectionId:'c1'});
  assert.equal(relinkRetry.skipped, "review-required");
  assert.equal(uploads, before);assert.equal(filters.length,numFilters,'failed retry must not claim or write, including relink');
  Object.assign(row,{status:'scheduled',connection_id:'c2',platform:'youtube'});
  const stale=await publishRow({...snapshot,connection_id:'c1'});assert.equal(stale.skipped,'already-claimed');assert.equal(row.status,'scheduled');assert.equal(uploads,before);
  const staleNull=await publishRow(snapshot);assert.equal(staleNull.skipped,'already-claimed');assert.equal(uploads,before);
  Object.assign(row,{platform:'tiktok'});const stalePlatform=await publishRow({...snapshot,connection_id:'c2'});assert.equal(stalePlatform.skipped,'already-claimed');assert.equal(uploads,before);
  const incomplete={...snapshot};delete incomplete.connection_id;const beforeIncomplete=filters.length;assert.equal((await publishRow(incomplete)).skipped,'not-claimable');assert.equal(filters.length,beforeIncomplete);
  console.log("ALL OK: طلبان متزامنان ⇒ حجز واحد ورفع واحد، وحجب إعادة الفشل الغامض بلا كتابة");
})().catch(e => { console.error(e); process.exitCode = 1; });

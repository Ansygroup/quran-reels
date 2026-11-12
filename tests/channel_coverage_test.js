#!/usr/bin/env node
/* اختبارات مسار القنوات في PostgREST محاكى، مع db الحقيقي ونشر محاكى. */
const assert = require("node:assert/strict");
process.env.SUPABASE_URL = "https://db.example"; process.env.SUPABASE_SERVICE_KEY = "test";
const pubPath = require.resolve("../lib/publish");
const calls = [];
require.cache[pubPath] = { id: pubPath, filename: pubPath, loaded: true, exports: {
  publishRow: async row => { calls.push(row.id); return row.id === "two" ? { ok: false, error: "expired" } : { ok: true, url: "https://youtu.be/one" }; },
  videoUrl: () => "", pickConnection: () => null,
} };
const ids = n => `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const source = Array.from({ length: 205 }, (_, i) => ({ id: ids(i), platform: "youtube", account_name: `c${i}`, is_default: i === 0 }));
let mode = "normal", requests = [], patches = [], storageWrites = 0;
function json(data) { return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => data, text: async () => "" }; }
global.fetch = async (url, opts = {}) => {
  const u = new URL(url), method = opts.method || "GET"; requests.push({ u, method });
  const table = u.pathname.split("/").at(-1), cursor = u.searchParams.get("id");
  if (u.pathname.startsWith("/storage/")) { storageWrites++; throw new Error("unexpected render/upload"); }
  if (table === "autopilot_runs") {
    if (method === "GET") return json([]);
    if (method === "POST") return json([{ id: "run-1", ...JSON.parse(opts.body) }]);
    if (method === "PATCH") { patches.push(JSON.parse(opts.body)); return json([]); }
  }
  if (table === "system_checks") return json([]);
  if (table === "social_connections") {
    if (u.searchParams.get("select") === "platform") return json([{ platform: "youtube" }]);
    assert.equal(u.searchParams.get("user_id"), "eq.u1");
    assert.equal(u.searchParams.get("platform"), "eq.youtube");
    assert.equal(u.searchParams.get("order"), "id.asc");
    if (mode === "fail_first" || (mode === "fail" && cursor)) return { ok: false, status: 503, text: async () => "unavailable" };
    if (mode === "empty") return json([]);
    if (mode === "invalid") return json([{ id: "", platform: "youtube" }]);
    const after = cursor && cursor.startsWith("gt.") ? cursor.slice(3) : "";
    const data = source.filter(r => !after || mode === "stalled" || r.id > after).slice(0, 100);
    return json(data);
  }
  throw new Error(`unexpected ${method} ${url}`);
};
(async () => {
  const A = require("../lib/autopilot"), T = A.__test;
  const rows = await T.connectionsFor("u1", "youtube");
  assert.equal(rows.length, 205);
  assert.deepEqual(T.planTargets(["youtube"], { youtube: rows }, true).map(r => r.connection_id), source.map(r => r.id));
  assert(requests.some(c => c.u.searchParams.get("id") === `gt.${ids(199)}`));
  mode = "fail"; requests = []; await assert.rejects(() => T.connectionsFor("u1", "youtube"), /503/);
  mode = "stalled"; await assert.rejects(() => T.connectionsFor("u1", "youtube"), /صفحات/);
  mode = "invalid"; await assert.rejects(() => T.connectionsFor("u1", "youtube"), /صفحات/);
  assert.throws(() => T.planTargets(["youtube"], { youtube: [] }, true), /تحديد قنوات/);
  assert.throws(() => T.planTargets(["youtube"], { youtube: [{}] }, true), /تحديد قنوات/);
  const partial = await T.publishTargets([{ platform: "youtube", connection_id: "c1", row: { id: "one" } }, { platform: "youtube", connection_id: "c2", row: { id: "two" } }]);
  assert.deepEqual(calls.sort(), ["one", "two"]); assert.equal(partial.failed, 1); assert.deepEqual(partial.urls, ["https://youtu.be/one"]); assert.match(partial.why, /expired/);
  const failResult = await T.runWithRetry(async () => ({ ok: false, stage: "publish" }), { budgetMs: 99999 }); assert.equal(failResult.attempts, 1);
  // فشل الصفحة بعد إنشاء تشغيل يُسجَّل failed قبل الرندر أو إدراج صفوف.
  mode = "fail_first"; requests = []; patches = []; calls.length = 0;
  const run = await A.generateAndPublish("u1", { runType: "daily", config: { platforms: ["youtube"], all_channels: true } });
  assert.equal(run.ok, false); assert.match(run.error, /503/); assert(patches.some(p => p.status === "failed" && /503/.test(p.error))); assert.equal(storageWrites, 0); assert.equal(calls.length, 0);
  console.log("ALL OK: 205 قنوات عبر الصفحات، فشل مغلق، واستقلال محاولة كل قناة محاكيًا");
})().catch(e => { console.error(e); process.exitCode = 1; });

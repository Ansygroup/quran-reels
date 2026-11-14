#!/usr/bin/env node
/* اختبار مسار التجديد والنشر بقاعدة وشبكة محاكيتين وتشفير حقيقي. */
const assert = require("assert");
process.env.TOKEN_ENC_KEY = "test-key";
process.env.SUPABASE_URL = "https://storage.example";
process.env.GOOGLE_CLIENT_ID = "test";
process.env.GOOGLE_CLIENT_SECRET = "test";
const { seal, open } = require("../lib/crypt");
const dbPath = require.resolve("../lib/db");
let channel = null;
const queries = [];
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  q: async (sql, params) => { queries.push({ sql, params }); if (/set status='publishing'/i.test(sql)) return [{ id: params[0], user_id: params[1], status: "publishing", platform: "instagram", connection_id: "ig1", video_path: "video.mp4" }]; return /from social_connections/i.test(sql) ? (channel ? [channel] : []) : []; },
  q1: async () => null,
}};
const pub = require("../lib/publish");
const requests = [];
global.fetch = async (url, opts = {}) => {
  requests.push({ url: String(url), opts });
  if (String(url).includes("oauth2.googleapis.com/token")) return { ok: true, json: async () => ({ access_token: "new-access", expires_in: 3600 }) };
  if (String(url).includes("graph.facebook.com")) return { ok: false, status: 400, json: async () => ({ error: { message: "simulated" } }) };
  throw new Error("unexpected fetch " + url);
};
(async () => {
  const conn = { id: "c1", platform: "youtube", access_token: seal("old-access"), refresh_token: seal("old-refresh"), expires_at: 0 };
  const renewed = await pub.__test.refreshIfNeeded(conn);
  assert.strictEqual(open(renewed.access_token), "new-access");
  assert.strictEqual(open(renewed.refresh_token), "old-refresh");
  const saved = queries.find(q => /update social_connections set access_token/.test(q.sql));
  assert.strictEqual(open(saved.params[0]), "new-access");
  assert.strictEqual(open(saved.params[1]), "old-refresh");
  assert.strictEqual(pub.pickConnection([{ id: "own", is_default: true }], "missing"), null);
  channel = { id: "ig1", user_id: "u1", platform: "instagram", access_token: seal("ig-access"), meta: seal(JSON.stringify({ ig_id: "ig42" })) };
  queries.length = 0;
  const out = await pub.publishRow({ id: "q1", user_id: "u1", platform: "instagram", connection_id: "ig1", video_path: "video.mp4", status: "scheduled" });
  assert.strictEqual(out.ok, false); // فشل متعمّد من الشبكة المحاكاة بعد الوصول للنشر.
  assert(queries.some(q => /from social_connections/i.test(q.sql) && q.params[1] === "instagram"));
  assert(requests.some(r => r.url.includes("/ig42/media?") && r.opts.headers.Authorization === "Bearer ig-access"));
  console.log("ALL OK: تجديد مشفّر، رفض قناة محذوفة، واستعمال صف إنستغرام");
})().catch(e => { console.error(e); process.exitCode = 1; });

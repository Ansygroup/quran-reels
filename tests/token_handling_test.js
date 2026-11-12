#!/usr/bin/env node
/* تحقق من صلاحية التجديد دون إرسال الأسرار للمتصفح، مع تشفير حقيقي. */
const assert = require("node:assert/strict");
process.env.TOKEN_ENC_KEY = "token-handling-test";
const { seal } = require("../lib/crypt");
const { readRefreshToken } = require("../lib/refresh_token");
const empty = seal("");
assert.equal(readRefreshToken(empty), null);
assert.equal(readRefreshToken("not-valid-ciphertext"), null);
assert.equal(readRefreshToken(seal("refresh-secret")), "refresh-secret");
const sessPath = require.resolve("../lib/sess");
require.cache[sessPath] = { id: sessPath, filename: sessPath, loaded: true, exports: { getUserId: async () => "u1" } };
const dbPath = require.resolve("../lib/db");
const rows = [
  { id: "yt1", platform: "youtube", account_name: "a", refresh_token: seal("refresh-secret") },
  { id: "yt2", platform: "youtube", account_name: "b", refresh_token: empty },
  { id: "yt3", platform: "youtube", account_name: "c", refresh_token: "corrupt" },
  { id: "fb", platform: "facebook", account_name: "fb", refresh_token: "" },
];
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { q: async () => rows, q1: async () => null } };
const list = require("../lib/soc_list");
const { refreshIfNeeded } = require("../lib/publish").__test;
let network = 0;
global.fetch = async () => { network++; throw new Error("unexpected network"); };
const res = { headers: {}, statusCode: 0, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; } };
(async () => {
  await list({ method: "GET" }, res);
  const result = JSON.parse(res.body);
  assert.deepEqual(result.connections.map(c => c.has_refresh), [true, false, false, null]);
  assert(!res.body.includes("refresh-secret") && !res.body.includes(empty) && !res.body.includes("refresh_token"));
  const current = { platform: "youtube", expires_at: Date.now() + 3600000, refresh_token: "" };
  assert.equal(await refreshIfNeeded(current), current); // التوكن الحالي يُستعمل حتى انتهاء صلاحيته.
  await assert.rejects(refreshIfNeeded({ ...current, expires_at: 0 }), /لا يوجد تصريح تجديد صالح/);
  assert.equal(network, 0);
  assert.equal((await refreshIfNeeded({ platform: "facebook", expires_at: 0, refresh_token: "" })).platform, "facebook");
  console.log("ALL OK: التوكن الفارغ والتالف ليسا تصريحًا، والبيانات لا تكشف الأسرار");
})().catch(e => { console.error(e); process.exitCode = 1; });

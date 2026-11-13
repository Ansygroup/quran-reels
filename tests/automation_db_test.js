#!/usr/bin/env node
/* اختبار عبر مترجم SQL الحقيقي: الأعمدة والاستجابة مثل PostgREST، لا بديل q. */
const assert = require("assert");
const Module = require("module");
const load = Module._load;
Module._load = function (name) {
  if (name === "@sparticuz/chromium" || name === "playwright-core" || name === "playwright") return {};
  return load.apply(this, arguments);
};
process.env.SUPABASE_URL = "https://example.test";
process.env.SUPABASE_SERVICE_KEY = "test";
let row = null;
const calls = [];
global.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const method = opts.method || "GET";
  const body = opts.body ? JSON.parse(opts.body) : null;
  calls.push({ u, method, body });
  const selected = (u.searchParams.get("select") || "").split(",");
  // schema.sql: جدول autopilot ليس فيه عمود id.
  const bad = u.pathname.endsWith("/autopilot") && selected.includes("id");
  if (!bad && u.pathname.endsWith("/autopilot") && method === "POST") row = body;
  if (!bad && u.pathname.endsWith("/autopilot") && method === "PATCH") row = { ...row, ...body };
  const data = u.pathname.endsWith("/autopilot") && row ? [row] : [];
  return { ok: !bad, status: bad ? 400 : 200, headers: { get: () => "application/json" }, json: async () => data, text: async () => "unknown column" };
};
(async () => {
  const { enableDefaultAutomation } = require("../lib/autopilot");
  assert.strictEqual(await enableDefaultAutomation("u1", "youtube"), "created");
  assert.strictEqual(row.enabled, true);
  assert.deepStrictEqual(row.platforms, ["youtube"]);
  assert.strictEqual(row.at_utc, "04:15:00");
  row.enabled = false;
  assert.strictEqual(await enableDefaultAutomation("u1", "tiktok"), "extended");
  assert.strictEqual(row.enabled, false);
  assert.deepStrictEqual(row.platforms, ["youtube", "tiktok"]);
  assert(calls.some((c) => c.u.searchParams.get("select") === "user_id, enabled, platforms"));
  console.log("ALL OK: مترجم قاعدة البيانات ينشئ الأتمتة ويحترم الإيقاف عند إضافة منصة");
})().catch((e) => { console.error(e); process.exitCode = 1; });

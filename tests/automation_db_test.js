#!/usr/bin/env node
/* اختبار تكامل HTTP مُحاكى لـ RPC؛ اختبار قاعدة بيانات فعلي منفصل. */
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
  let data = [];
  if (u.pathname.endsWith('/rpc/link_autopilot_platform_guarded')) {
    if (!row) { row={user_id:body.p_user_id,enabled:true,at_utc:'04:15:00',platforms:[body.p_platform],template:body.p_template}; data='created'; }
    else if (!row.platforms.includes(body.p_platform)) { row.platforms.push(body.p_platform); data='extended'; }
    else data='unchanged';
  }
  return { ok:true, status:200, headers:{get:()=> 'application/json'}, json:async()=>data };

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
  assert(calls.every((c) => c.u.pathname.endsWith("/rpc/link_autopilot_platform_guarded") && c.method === "POST"));
  console.log("ALL OK: مترجم قاعدة البيانات ينشئ الأتمتة ويحترم الإيقاف عند إضافة منصة");
})().catch((e) => { console.error(e); process.exitCode = 1; });

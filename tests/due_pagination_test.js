#!/usr/bin/env node
/* يختبر ترقيم اختيار المهام عبر مترجم SQL وPostgREST محاكًى، بلا شبكة. */
const assert = require("node:assert/strict");
process.env.SUPABASE_URL = "https://example.test";
process.env.SUPABASE_SERVICE_KEY = "test";
const user = n => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const runId = n => `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const configs = Array.from({ length: 255 }, (_, i) => ({ user_id: user(i), enabled: true, platforms: ["youtube"] }));
const runs = Array.from({ length: 230 }, (_, i) => ({ id: runId(i), user_id: user(i), status: "published", created_at: "2026-11-12T04:30:00Z" }));
const published = Array.from({ length: 250 }, (_, i) => ({ id: runId(i), video_path: `u/autopilot/2026-11-13-${i}.mp4` }));
published.push({ id: runId(250), video_path: "u/autopilot/2026-11-12-target.mp4" });
const calls = [];
let fail = "";
let repeated = false;
global.fetch = async (url) => {
  const u = new URL(url);
  calls.push(u);
  const table = u.pathname.split("/").pop();
  if (table === "publish_queue") {
    const like = u.searchParams.get("video_path");
    const marker = like && like.startsWith("like.") ? like.slice(5).replace(/\*/g, "") : "";
    const data = (marker ? published.filter(r => r.video_path.includes(marker)) : published).slice(0, Number(u.searchParams.get("limit") || 1000));
    return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => data };
  }
  const cursor = u.searchParams.get(table === "autopilot" ? "user_id" : "id");
  if (fail === table && cursor) return { ok: false, status: 503, text: async () => "unavailable" };
  const source = table === "autopilot" ? configs : table === "autopilot_runs" ? runs : [];
  const field = table === "autopilot" ? "user_id" : "id";
  const after = cursor && cursor.startsWith("gt.") ? cursor.slice(3) : null;
  const list = source.filter(r => !after || repeated || r[field] > after).slice(0, Number(u.searchParams.get("limit") || 1000));
  return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => list };
};
(async () => {
  const { dueConfigs, dayHasPublish } = require("../lib/autopilot");
  const due = await dueConfigs("2026-11-12", 3);
  assert.equal(due.all.length, 255);
  assert.equal(due.settled.length, 230);
  assert.equal(due.picks.length, 3);
  assert.equal(due.pending, 22);
  assert(due.picks.every(c => Number(c.user_id.slice(-12)) >= 230));
  assert(calls.some(u => u.pathname.endsWith("/autopilot") && u.searchParams.get("user_id") === "gt." + user(199)));
  assert(calls.some(u => u.pathname.endsWith("/autopilot_runs") && u.searchParams.get("id") === "gt." + runId(199)));
  console.log("OK   255 إعدادًا و230 منشورًا: كل الصفحات مقروءة ولا يُختار منشور");
  // لو لم يكتمل إلا أول عمل من كل دفعة، يصل رأس الدور لكل الحسابات.
  const oldRuns = runs.splice(0);
  const servedFirst = new Set();
  const base = Date.parse("2026-01-01T00:00:00Z");
  for (let i = 0; i < configs.length; i++) {
    const day = new Date(base + i * 86400000).toISOString().slice(0, 10);
    servedFirst.add((await dueConfigs(day, 3)).picks[0].user_id);
  }
  runs.push(...oldRuns);
  assert.equal(servedFirst.size, configs.length);
  console.log("OK   حتى مع مهمة واحدة لكل دفعة يصل رأس الدور إلى 255 حسابًا خلال 255 يومًا");
  assert.equal(await dayHasPublish(user(1), "2026-11-12"), true);
  assert.equal(await dayHasPublish(user(1), "2026-11-11"), false);
  const historyQuery = calls.find(u => u.pathname.endsWith("/publish_queue"));
  assert(historyQuery.searchParams.get("video_path").startsWith("like."));
  console.log("OK   منشور أقدم من 250 صفًا يُكتشف باليوم المراد قبل تطبيق limit");
  fail = "autopilot_runs";
  await assert.rejects(() => dueConfigs("2026-11-12", 3), /503/);
  fail = "autopilot";
  await assert.rejects(() => dueConfigs("2026-11-12", 3), /503/);
  console.log("OK   فشل صفحة لاحقة يوقف الاختيار بدل افتراض اكتمال القراءة");
  fail = "";
  repeated = true;
  await assert.rejects(() => dueConfigs("2026-11-12", 3), /مؤشر|صفحات/);
  console.log("OK   مؤشر لا يتقدم يوقف الاختيار ولا يدخل حلقة لا نهائية");
})().catch(e => { console.error(e); process.exitCode = 1; });

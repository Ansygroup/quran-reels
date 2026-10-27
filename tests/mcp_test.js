/*
 * اختبار خادم MCP (JSON-RPC فوق Streamable HTTP) — ضد الإنتاج افتراضيًا:
 *   1) /.well-known/mcp.json يشير للنقطة الصحيحة
 *   2) initialize ↔ نسخة بروتوكول + serverInfo
 *   3) notifications/* → 202
 *   4) tools/list → 6 أدوات مع inputSchema
 *   5) tools/call لكل الأدوات: info · qibla (136°) · prayer (تناوب + اتساق) · hijri · verse · create_reel
 *   6) method مجهول → -32601 · أداة مجهولة → -32602 · GET → 405
 * الاستخدام: node mcp_test.js  |  BASE=https://… node mcp_test.js
 */
const BASE = (process.env.BASE || "https://quran-reels-tau.vercel.app").replace(/\/+$/, "");

const H = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
const rpc = async (payload, method = "POST") => {
  const r = await fetch(BASE + "/api/mcp", method === "POST"
    ? { method, headers: H, body: JSON.stringify(payload) }
    : { method, headers: H });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
};

let ok = 0, fail = 0;
const fails = [];
const chk = (name, cond, extra = "") => {
  if (cond) { ok++; console.log("OK   " + name + (extra ? "  · " + String(extra).slice(0, 90) : "")); }
  else { fail++; fails.push(name); console.log("FAIL " + name + "  · " + String(extra).slice(0, 160)); }
};

(async () => {
  console.log("BASE =", BASE, "· MCP test");

  // 1) well-known
  const wk = await fetch(BASE + "/.well-known/mcp.json");
  const wkj = wk.ok ? await wk.json() : null;
  const wkUrl = wkj && wkj.mcpServers && wkj.mcpServers["quran-reels"] && wkj.mcpServers["quran-reels"].url;
  chk("well-known 200 + url", wk.status === 200 && wkUrl === BASE + "/api/mcp", `${wk.status} ${wkUrl}`);

  // 2) initialize
  const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "mcp_test", version: "1.0" } } });
  chk("initialize 200", init.status === 200, init.status);
  chk("initialize protocolVersion", init.json && init.json.result && init.json.result.protocolVersion === "2025-03-26", JSON.stringify(init.json && init.json.result && init.json.result.protocolVersion));
  chk("initialize serverInfo", !!(init.json && init.json.result && init.json.result.serverInfo && init.json.result.serverInfo.name === "quran-reels"));
  chk("initialize capabilities.tools", !!(init.json && init.json.result && init.json.result.capabilities && init.json.result.capabilities.tools));

  // 3) notification → 202
  const notif = await rpc({ jsonrpc: "2.0", method: "notifications/initialized" });
  chk("notification 202", notif.status === 202, notif.status);

  // 4) tools/list
  const lst = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const tools = (lst.json && lst.json.result && lst.json.result.tools) || [];
  const names = tools.map(t => t.name).sort();
  chk("tools/list = 6", tools.length === 6, names.join(","));
  chk("schemas present", tools.every(t => t.inputSchema && t.inputSchema.type === "object"));
  const want = ["create_reel", "get_hijri_date", "get_prayer_times", "get_qibla", "get_verse", "quran_reel_maker_info"];
  chk("tool names exact", JSON.stringify(names) === JSON.stringify(want), names.join(","));

  const call = async (name, args) => {
    const r = await rpc({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name, arguments: args } });
    const res = r.json && r.json.result;
    return { r, res, text: res && res.content && res.content[0] && res.content[0].text };
  };

  // 5a) info
  const info = await call("quran_reel_maker_info", {});
  chk("info ok + مجاني", !info.res.isError && /مجاني/.test(info.text || ""), (info.text || "").slice(0, 80));

  // 5b) qibla Cairo 136±1
  const qb = await call("get_qibla", { latitude: 30.0444, longitude: 31.2357 });
  const qm = (qb.text || "").match(/([\d.]+)°/);
  chk("qibla Cairo 136±1", qm && Math.abs(parseFloat(qm[1]) - 136.16) <= 1, qb.text);

  // 5c) prayer times — اتساق داخلي + قيم معقولة (التاريخ حيّ)
  const pt = await call("get_prayer_times", { latitude: 30.0444, longitude: 31.2357, timezone: "Africa/Cairo" });
  const g = k => { const m = (pt.text || "").match(new RegExp(k + ":\\s*(\\d{1,2}):(\\d{2})")); return m ? +m[1] * 60 + +m[2] : NaN; };
  const fajr = g("الفجر"), dhuhr = g("الظهر"), magh = g("المغرب"), isha = g("العشاء");
  chk("prayer structural", !!fajr && !!dhuhr && !!magh && !!isha, pt.text);
  chk("prayer isha−maghrib=90±3 (أم القرى)", isha - magh >= 87 && isha - magh <= 93, `${isha - magh}m`);
  chk("prayer fajr in 2:30–7:00", fajr >= 150 && fajr <= 420, String(Math.floor(fajr / 60)) + ":" + String(fajr % 60));
  chk("prayer dhuhr 11:30–13:10 (EoT+DST)", dhuhr >= 690 && dhuhr <= 790, String(Math.floor(dhuhr / 60)) + ":" + String(dhuhr % 60));
  const ptNoTz = await call("get_prayer_times", { latitude: 30.0444, longitude: 31.2357 });
  chk("prayer without timezone works", !ptNoTz.res.isError && /تقديري/.test(ptNoTz.text || ""), (ptNoTz.text || "").slice(0, 100));

  // 5d) hijri
  const hj = await call("get_hijri_date", {});
  chk("hijri arabic + هـ", !hj.res.isError && /هـ/.test(hj.text || ""), hj.text);
  const hj2 = await call("get_hijri_date", { date: "2026-01-01" });
  chk("hijri fixed date", !hj2.res.isError && /1447|١٤٤٧/.test(hj2.text || ""), hj2.text);

  // 5e) verse (Ikhlas)
  const vs = await call("get_verse", { surah: 112, from_ayah: 1, to_ayah: 4 });
  const strip = s => String(s || "").normalize("NFD").replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "").replace(/ٱ/g, "ا");
  chk("verse 112", !vs.res.isError && /قل\s+هو\s+الله/.test(strip(vs.text)), (vs.text || "").slice(0, 90));
  chk("verse deep link", /s=112&from=1&to=4/.test(vs.text || ""));
  const vsBad = await call("get_verse", { surah: 999 });
  chk("verse bad surah isError", vsBad.res.isError === true, (vsBad.text || "").slice(0, 60));

  // 5f) create_reel + قيد الـ30
  const cr = await call("create_reel", { surah: 18, from_ayah: 1, to_ayah: 5 });
  chk("create_reel url", !cr.res.isError && (cr.text || "").includes("/?s=18&from=1&to=5"), cr.text);
  const crBig = await call("create_reel", { surah: 2, from_ayah: 1, to_ayah: 100 });
  chk("create_reel caps at 30", /to=30/.test(crBig.text || ""), (crBig.text || "").split("\n")[0]);

  // 6) errors
  const unk = await rpc({ jsonrpc: "2.0", id: 3, method: "does/not/exist" });
  chk("unknown method -32601", unk.json && unk.json.error && unk.json.error.code === -32601, JSON.stringify(unk.json && unk.json.error));
  const badTool = await rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "nope", arguments: {} } });
  chk("unknown tool -32602", badTool.json && badTool.json.error && badTool.json.error.code === -32602, JSON.stringify(badTool.json && badTool.json.error));
  const getr = await fetch(BASE + "/api/mcp", { method: "GET" });
  chk("GET → 405", getr.status === 405, getr.status);
  const badJson = await fetch(BASE + "/api/mcp", { method: "POST", headers: H, body: "{oops" });
  chk("bad JSON → 400", badJson.status === 400, badJson.status);

  console.log(`\nMCP TEST: ${ok} OK · ${fail} FAIL / ${ok + fail}`);
  if (fails.length) fails.forEach(f => console.log("  fail:", f));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL:", e.message); process.exit(2); });

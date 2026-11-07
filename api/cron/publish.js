/* المجدول اليومي (Vercel Cron) — ينشر المهام المستحقة */
const { q } = require("../../lib/db");
const { publishRow } = require("../../lib/publish");
const { json } = require("../../lib/oauth");
const { runDailyAutopilots } = require("../../lib/autopilot");

module.exports = async (req, res) => {
  const auth = req.headers.authorization || "";
  const secret = process.env.CRON_SECRET || "";
  if (!secret || auth !== `Bearer ${secret}`) return json(res, 401, { error: "unauthorized" });
  let autopilot = [];
  try { autopilot = await runDailyAutopilots(); }
  catch (e) { autopilot = [{ ok: false, error: String(e?.message || e).slice(0, 180) }]; }
  const rows = await q(
    `select * from publish_queue where status='scheduled' and publish_at <= now() order by publish_at asc limit 12`
  );
  let ok = 0, fail = 0;
  const errors = [];
  for (const row of rows) {
    const out = await publishRow(row);
    if (out.ok) ok++; else { fail++; errors.push(String(out.error || "").slice(0, 140)); }
  }
  const autoOk = autopilot.filter(x => x.ok).length;
  const autoFail = autopilot.filter(x => x.ok === false).length;
  json(res, 200, { ran: rows.length, ok, fail, errors, autopilot: { ran: autopilot.length, ok: autoOk, fail: autoFail }, at: new Date().toISOString() });
};

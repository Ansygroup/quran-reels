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
  catch (e) {
    /* استثناء غير ملتقط (قاعدة ساقطة، وحدة مفقودة…) كان يُحصى «فشل» فقط،
     * بلا سبب في الرد ولا صفّ في system_checks — أي فشل صامت تمامًا.
     * نسجّله هنا حتى يظهر في اللوحة وفي سجل الكرون. */
    const reason = String(e?.message || e).slice(0, 180);
    autopilot = [{ ok: false, error: reason }];
    try {
      await q(`insert into system_checks (kind, ok, detail) values ('autopilot_daily', false, $1::jsonb)`,
        [JSON.stringify({ error: reason, source: "cron_publish", at: new Date().toISOString() })]);
    } catch { /* لا نُسقط الكرون بسبب التسجيل */ }
  }
  const rows = await q(
    `select * from publish_queue where status='scheduled' and publish_at <= now() order by publish_at asc limit 12`
  );
  let ok = 0, fail = 0;
  const errors = [];
  for (const row of rows) {
    const out = await publishRow(row);
    if (out.ok) ok++; else { fail++; errors.push(String(out.error || "").slice(0, 140)); }
  }
  const autoOk = autopilot.filter(x => x && x.ok).length;
  const autoFail = autopilot.filter(x => x && x.ok === false).length;
  const autoErrors = autopilot.filter(x => x && x.ok === false)
    .map(x => String(x.error || "").slice(0, 160)).filter(Boolean);
  json(res, 200, { ran: rows.length, ok, fail, errors, autopilot: { ran: autopilot.length, ok: autoOk, fail: autoFail, errors: autoErrors }, at: new Date().toISOString() });
};

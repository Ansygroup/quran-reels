/* المجدول اليومي (Vercel Cron) — ينشر المهام المستحقة + الأتمتة */
const { q } = require("../../lib/db");
const { publishRow } = require("../../lib/publish");
const { json } = require("../../lib/oauth");
const { runAutopilot } = require("../../lib/autopilot");

module.exports = async (req, res) => {
  const auth = req.headers.authorization || "";
  const secret = process.env.CRON_SECRET || "";
  if (!secret || auth !== `Bearer ${secret}`) return json(res, 401, { error: "unauthorized" });

  // تشغيل الأتمتة لجميع المستخدمين المفعّلين
  const autoResults = [];
  try {
    const users = await q("select user_id from autopilot where enabled=true");
    for (const u of users) {
      autoResults.push(await runAutopilot(u.user_id));
    }
  } catch (e) {
    autoResults.push({ ok: false, error: String(e.message || e) });
  }

  // نشر المهام المستحقة
  const rows = await q(
    `select * from publish_queue where status='scheduled' and publish_at <= now() order by publish_at asc limit 12`
  );
  let ok = 0, fail = 0;
  const errors = [];
  for (const row of rows) {
    const out = await publishRow(row);
    if (out.ok) ok++; else { fail++; errors.push(String(out.error || "").slice(0, 140)); }
  }
  json(res, 200, { autopilot: autoResults, ran: rows.length, ok, fail, errors, at: new Date().toISOString() });
};

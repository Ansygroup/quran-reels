/* المجدول اليومي (Vercel Cron) — ينشر المهام المستحقة */
const { q } = require("../../lib/db");
const { publishRow } = require("../../lib/publish");
const { json } = require("../../lib/oauth");

module.exports = async (req, res) => {
  const auth = req.headers.authorization || "";
  const secret = process.env.CRON_SECRET || "";
  if (!secret || auth !== `Bearer ${secret}`) return json(res, 401, { error: "unauthorized" });
  const rows = await q(
    `select * from publish_queue where status='scheduled' and publish_at <= now() order by publish_at asc limit 12`
  );
  let ok = 0, fail = 0;
  const errors = [];
  for (const row of rows) {
    const out = await publishRow(row);
    if (out.ok) ok++; else { fail++; errors.push(String(out.error || "").slice(0, 140)); }
  }
  json(res, 200, { ran: rows.length, ok, fail, errors, at: new Date().toISOString() });
};

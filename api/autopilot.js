/* تشغيل الأتمتة (cron أو يدوي) */
const { q } = require("../lib/db");
const { runAutopilot } = require("../lib/autopilot");
const { json } = require("../lib/oauth");

module.exports = async (req, res) => {
  const auth = req.headers.authorization || "";
  const secret = process.env.CRON_SECRET || "";
  const isCron = secret && auth === `Bearer ${secret}`;

  let userId = null;
  if (isCron) {
    // تشغيل لجميع المستخدمين المفعّلين
    const users = await q("select user_id from autopilot where enabled=true");
    const results = [];
    for (const u of users) {
      results.push(await runAutopilot(u.user_id));
    }
    return json(res, 200, { ran: users.length, results, at: new Date().toISOString() });
  }

  // تشغيل يدوي — يتطلب user_id
  const body = req.body || {};
  userId = body.user_id;
  if (!userId) return json(res, 400, { error: "user_id required" });
  const out = await runAutopilot(userId);
  json(res, out.ok ? 200 : 500, out);
};

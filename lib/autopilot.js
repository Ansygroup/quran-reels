/* الأتمتة اليومية — توليد ونشر فيديو تلقائي */
const { q, q1 } = require("./db");
const { publishRow } = require("./publish");

// تحميل @sparticuz/chromium ديناميكياً (ES Module)
async function getChromium() {
  const mod = await import("@sparticuz/chromium");
  return mod.default || mod;
}

async function getPlaywright() {
  const mod = await import("playwright-core");
  return mod;
}

async function runAutopilot(userId) {
  const settings = await q1("select * from autopilot where user_id=$1", [userId]);
  if (!settings || !settings.enabled) return { ok: false, error: "disabled" };

  const runId = (await q1(
    "insert into autopilot_runs (user_id, status) values ($1, 'running') returning id",
    [userId]
  )).id;

  try {
    const chromium = await getChromium();
    const pw = await getPlaywright();
    const browser = await pw.chromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    const page = await browser.newPage();
    // TODO: implement video generation logic
    await browser.close();

    await q("update autopilot_runs set status='success' where id=$1", [runId]);
    return { ok: true, runId };
  } catch (e) {
    await q("update autopilot_runs set status='failed', error=$1 where id=$2", [String(e.message || e).slice(0, 500), runId]);
    return { ok: false, error: String(e.message || e), runId };
  }
}

module.exports = { runAutopilot, getChromium };

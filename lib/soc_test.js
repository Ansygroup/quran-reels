/* اختبار الاتصال بقناة */
const { getUserId } = require("./sess");
const { q1 } = require("./db");
const { open } = require("./crypt");
const { json } = require("./oauth");
const { refreshIfNeeded } = require("./publish");

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  const uid = await getUserId(req);
  if (!uid) return json(res, 401, { error: "unauthorized" });
  let b = {};
  try { b = JSON.parse((await new Promise(r => { let d = ""; req.on("data", c => d += c); req.on("end", () => r(d)); })) || "{}"); } catch {}
  if (!b.id) return json(res, 400, { error: "id required" });
  const conn = await q1("select * from social_connections where id=$1 and user_id=$2", [b.id, uid]);
  if (!conn) return json(res, 404, { error: "not found" });
  try {
    const refreshed = await refreshIfNeeded(conn);
    json(res, 200, { ok: true });
  } catch (e) {
    json(res, 200, { ok: false, error: String(e.message || e) });
  }
};

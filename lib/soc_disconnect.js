/* فك ربط منصة */
const { getUserId } = require("./sess");
const { q } = require("./db");
const { json } = require("./oauth");

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  const uid = await getUserId(req);
  if (!uid) return json(res, 401, { error: "unauthorized" });
  let id = "";
  try { const b = JSON.parse((await new Promise(r => { let d = ""; req.on("data", c => d += c); req.on("end", () => r(d)); })) || "{}"); id = b.id || ""; } catch {}
  if (!id) return json(res, 400, { error: "id" });
  await q(`delete from social_connections where id=$1 and user_id=$2`, [id, uid]);
  json(res, 200, { ok: true });
};

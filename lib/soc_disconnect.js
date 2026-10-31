/* فك ربط منصة */
const { getUserId } = require("./sess");
const { q, q1 } = require("./db");
const { json } = require("./oauth");

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  const uid = await getUserId(req);
  if (!uid) return json(res, 401, { error: "unauthorized" });
  let id = "";
  try { const b = JSON.parse((await new Promise(r => { let d = ""; req.on("data", c => d += c); req.on("end", () => r(d)); })) || "{}"); id = b.id || ""; } catch {}
  if (!id) return json(res, 400, { error: "id" });
  const removed = await q(`delete from social_connections where id=$1 and user_id=$2 returning platform`, [id, uid]);
  if (removed?.[0]?.platform === "youtube") {
    const config = await q1(`select enabled, youtube_connection_ids from autopilot where user_id=$1 limit 1`, [uid]);
    const remaining = await q(`select id from social_connections where user_id=$1 and platform='youtube'`, [uid]);
    if (config && Array.isArray(config.youtube_connection_ids) && config.youtube_connection_ids.length) {
      const connected = new Set((Array.isArray(remaining) ? remaining : []).map(row => String(row.id)));
      const selected = config.youtube_connection_ids.map(String).filter(channelId => connected.has(channelId));
      await q(`update autopilot set youtube_connection_ids=$1, enabled=$2, updated_at=now() where user_id=$3`, [selected, config.enabled && selected.length > 0, uid]);
    } else if (!Array.isArray(remaining) || remaining.length === 0) {
      await q(`update autopilot set enabled=false, updated_at=now() where user_id=$1`, [uid]);
    }
  }
  json(res, 200, { ok: true });
};

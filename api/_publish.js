/* نشر فوري أو إضافة مهمة جدولة — بجلسة المستخدم (يُخدَم عبر /api/gw?op=publish،
 * والرابط القديم /api/publish يعمل عبر rewrite في vercel.json) */
const { getUserId } = require("../lib/sess");
const { q, q1 } = require("../lib/db");
const { publishRow } = require("../lib/publish");
const { json } = require("../lib/oauth");

const PLATFORMS = ["youtube", "facebook", "instagram", "tiktok", "x"];

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  const uid = await getUserId(req);
  if (!uid) return json(res, 401, { error: "سجل الدخول أولًا" });
  let b = {};
  try { b = JSON.parse((await new Promise(r => { let d = ""; req.on("data", c => d += c); req.on("end", () => r(d)); })) || "{}"); } catch {}

  if (b.queue_id) {
    const row = await q1(`select * from publish_queue where id=$1 and user_id=$2`, [b.queue_id, uid]);
    if (!row) return json(res, 404, { error: "المهمة غير موجودة" });
    if (row.status === "published") return json(res, 400, { error: "منشورة مسبقًا" });
    const out = await publishRow(row);
    return json(res, out.ok ? 200 : out.skipped === "review-required" ? 409 : 502, out);
  }

  if (!PLATFORMS.includes(b.platform) || !b.video_path || typeof b.video_path !== "string") return json(res, 400, { error: "بيانات ناقصة" });
  const now = b.publish_at ? new Date(b.publish_at) : new Date();
  if (isNaN(now.getTime())) return json(res, 400, { error: "وقت غير صالح" });

  /* قناة محددة (اختياري): يجب أن تكون للمستخدم وبنفس المنصة.
   * بلا تحديد ⇒ القناة الافتراضية، وإلا الأحدث (انظر pickConnection). */
  let connId = null;
  if (b.connection_id) {
    const conn = await q1(`select id, platform from social_connections where id=$1 and user_id=$2`, [String(b.connection_id), uid]);
    const okPlat = conn && (conn.platform === b.platform || (b.platform === "instagram" && conn.platform === "facebook"));
    if (!okPlat) return json(res, 400, { error: "قناة غير مرتبطة بهذه المنصة" });
    connId = conn.id;
  }

  const row = await q1(
    `insert into publish_queue (user_id, platform, video_path, video_name, title, caption, hashtags, status, publish_at, connection_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
    [uid, b.platform, b.video_path.replace(/^\/+/, ""), String(b.video_name || "").slice(0, 120),
      String(b.title || "ريلز قرآن").slice(0, 120), String(b.caption || "").slice(0, 4000),
      String(b.hashtags || "").slice(0, 500), b.now ? "scheduled" : "scheduled", now.toISOString(), connId]
  );
  if (b.now || now.getTime() <= Date.now()) {
    const out = await publishRow(row);
    return json(res, out.ok ? 200 : 502, out);
  }
  json(res, 200, { ok: true, queued: true, id: row.id, publish_at: row.publish_at });
};

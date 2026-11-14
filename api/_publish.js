/* نشر فوري أو إضافة مهمة جدولة — بجلسة المستخدم (يُخدَم عبر /api/gw?op=publish،
 * والرابط القديم /api/publish يعمل عبر rewrite في vercel.json) */
const { getUserId } = require("../lib/sess");
const crypto = require("node:crypto");
const { q1, rest } = require("../lib/db");
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
  const requestedAt = b.publish_at ? new Date(b.publish_at) : new Date();
  if (isNaN(requestedAt.getTime())) return json(res, 400, { error: "وقت غير صالح" });
  const immediate = Boolean(b.now) || requestedAt.getTime() <= Date.now();

  /* قناة محددة (اختياري): يجب أن تكون للمستخدم وبنفس المنصة.
   * بلا تحديد ⇒ القناة الافتراضية، وإلا الأحدث (انظر pickConnection). */
  let connId = null;
  if (b.connection_id) {
    const wantedId = String(b.connection_id).toLowerCase(); // PostgreSQL emits UUIDs in lowercase.
    let conn;
    try { conn = await q1(`select id, platform from social_connections where id=$1 and user_id=$2`, [wantedId, uid]); }
    catch { return json(res, 503, { error: "تعذّر التحقق من القناة — لم تُنشأ المهمة" }); }
    // Meta stores Facebook and Instagram as separate connections; the publisher
    // only searches the selected platform and never resolves a Facebook ID to IG.
    if (!conn || conn.id !== wantedId || conn.platform !== b.platform) return json(res, 400, { error: "قناة غير مرتبطة بهذه المنصة" });
    connId = conn.id;
  }

  // Immediate requests start as drafts so a lost insert reply cannot by itself
  // make cron dispatch them. Future schedules must remain scheduled to work;
  // a lost reply may still leave a live schedule and must not be replayed blindly.
  const expected = {
    id: crypto.randomUUID(), user_id: uid, platform: b.platform,
    video_path: b.video_path.replace(/^\/+/, ""), video_name: String(b.video_name || "").slice(0, 120),
    title: String(b.title || "ريلز قرآن").slice(0, 120), caption: String(b.caption || "").slice(0, 4000),
    hashtags: String(b.hashtags || "").slice(0, 500), status: immediate ? "draft" : "scheduled",
    publish_at: requestedAt.toISOString(), connection_id: connId,
  };
  const uncertain = () => json(res, 503, { ok: false, skipped: "queue-unconfirmed", error: immediate
    ? "تعذّر تأكيد إنشاء المهمة؛ قد تكون حُفظت — راجع قائمة النشر والمنصة قبل إعادة المحاولة"
    : "تعذّر تأكيد الجدولة؛ قد تكون المهمة مجدولة وستُنشر — راجع قائمة النشر والمنصة قبل إعادة المحاولة" });
  let rows;
  try {
    rows = await rest("/rest/v1/publish_queue", {
      method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(expected),
    }, { requireRepresentation: true });
  } catch { return uncertain(); }
  const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  const fields = ["id", "user_id", "platform", "video_path", "video_name", "title", "caption", "hashtags", "status", "connection_id"];
  if (!row || fields.some(k => !Object.prototype.hasOwnProperty.call(row, k) || row[k] !== expected[k]) ||
      typeof row.publish_at !== "string" || !Number.isFinite(Date.parse(row.publish_at)) || Date.parse(row.publish_at) !== requestedAt.getTime()) return uncertain();
  if (immediate) {
    let out;
    try { out = await publishRow(row); }
    catch { return json(res, 503, { ok: false, skipped: "publish-unconfirmed", error: "تعذّر تأكيد نتيجة النشر؛ قد يكون الفيديو وصل للمنصة — راجع القائمة والمنصة قبل إعادة المحاولة" }); }
    return json(res, out.ok ? 200 : 502, out);
  }
  return json(res, 200, { ok: true, queued: true, id: row.id, publish_at: row.publish_at });
};

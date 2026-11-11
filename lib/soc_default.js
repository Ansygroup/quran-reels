/* تعيين القناة الافتراضية للنشر — قناة واحدة افتراضية لكل (مستخدم، منصة).
 * بدونه كان النشر يأخذ «أحدث صف مربوط»، فربط قناة يوتيوب ثانية يحوّل
 * النشر إليها بصمت بلا أي إشعار. */
const { getUserId } = require("./sess");
const { q, q1 } = require("./db");
const { json } = require("./oauth");

/* أول قناة تُربط لمنصة تصبح افتراضية تلقائيًا (وإلا لما وُجد هدف للنشر
 * عند من ربط قناة ثانية قبل إضافة العمود). لا نلمس افتراضية موجودة أبدًا. */
async function ensureDefault(uid, platform) {
  try {
    await q(
      `update social_connections set is_default=true
       where id = (select id from social_connections where user_id=$1 and platform=$2 order by updated_at desc limit 1)
         and not exists (select 1 from social_connections d where d.user_id=$1 and d.platform=$2 and d.is_default)`,
      [uid, platform]
    );
    return true;
  } catch {
    return false; /* التفضيل ليس سببًا لإفشال الربط */
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  const uid = await getUserId(req);
  if (!uid) return json(res, 401, { error: "سجّل الدخول أولًا" });
  let b = {};
  try {
    b = JSON.parse((await new Promise((r) => {
      let d = "";
      req.on("data", (c) => (d += c));
      req.on("end", () => r(d));
    })) || "{}");
  } catch { /* جسم غير صالح ⇒ يبقى {} */ }
  const id = String(b.id || "").trim();
  if (!id) return json(res, 400, { error: "معرّف القناة مطلوب" });

  /* التحقق من الملكية أولًا: لا نسمح بتعيين قناة مستخدم آخر افتراضية */
  const conn = await q1(`select id, platform from social_connections where id=$1 and user_id=$2`, [id, uid]);
  if (!conn) return json(res, 404, { error: "القناة غير موجودة" });

  await q(`update social_connections set is_default=false where user_id=$1 and platform=$2`, [uid, conn.platform]);
  await q(`update social_connections set is_default=true where id=$1 and user_id=$2`, [id, uid]);
  return json(res, 200, { ok: true, id, platform: conn.platform });
};
module.exports.ensureDefault = ensureDefault;

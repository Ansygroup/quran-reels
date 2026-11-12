/* محاولة محدودة بعد إعادة الربط: لا نعتبر كل فشل دليلاً على عدم النشر. */
const { q, q1, rest } = require("./db");
const { publishRow, pickConnection } = require("./publish");

// هاتان الرسالتان تصدران قبل بدء الرفع عند رفض تجديد التوكن، وليستا خطأ رفع مجهولًا.
function safeAuthFailure(error) {
  return /^(?:تجديد التوكن فشل \([^)]*\): invalid_grant|انتهت صلاحية ربط .+ — أعد الربط من لوحة الحساب ثم سيُنشر الفيديو الجاهز \(invalid_grant\))$/i.test(String(error || "").trim());
}

async function resumeAfterRelink(userId, platform, accountId) {
  if (platform !== "youtube" || !userId || !accountId || accountId === "me") return { status: "skipped" };
  const config = await q1(`select enabled, platforms, all_channels from autopilot where user_id=$1 limit 1`, [userId]);
  if (!config || config.enabled !== true || !Array.isArray(config.platforms) || !config.platforms.includes(platform)) return { status: "skipped" };
  const conns = await q(`select id, account_id, is_default, updated_at from social_connections where user_id=$1 and platform=$2`, [userId, platform]);
  if (!Array.isArray(conns)) throw new Error("تعذّر قراءة القنوات");
  const matches = conns.filter(c => c.account_id === accountId);
  if (matches.length !== 1) return { status: "skipped" };
  const conn = matches[0];
  const candidates = await q(`select * from publish_queue where user_id=$1 and platform=$2 and status='failed' and error ilike $3 order by created_at desc, id asc limit 50`, [userId, platform, "%invalid_grant%"]);
  if (!Array.isArray(candidates) || candidates.length >= 50) throw new Error("تعذّر مراجعة كل الفيديوهات الجاهزة");
  let relevant = candidates.filter(r => safeAuthFailure(r.error) && /\/autopilot\/\d{4}-\d{2}-\d{2}-/.test(String(r.video_path || "")) && (!r.connection_id || String(r.connection_id) === String(conn.id)));
  if (!relevant.length) return { status: "skipped" };
  // القناة الافتراضية القديمة لا تُعرف من الصف؛ نطلب علامة التجديد لنفس القناة قرب وقت الفشل.
  if (relevant.some(r => !r.connection_id)) {
    const chosen = pickConnection(conns, null);
    const marks = await rest(`/rest/v1/system_checks?kind=eq.reauth_needed&detail->>connection_id=eq.${encodeURIComponent(conn.id)}&select=created_at&order=created_at.desc&limit=1`);
    if (!Array.isArray(marks)) throw new Error("تعذّر التحقق من القناة السابقة");
    const marked = Date.parse(marks[0]?.created_at || "");
    relevant = relevant.filter(r => {
      if (r.connection_id) return true;
      const failed = Date.parse(r.updated_at || "");
      return chosen && String(chosen.id) === String(conn.id) && Number.isFinite(marked) && Number.isFinite(failed) && marked <= failed && failed - marked <= 300000;
    });
  }
  if (!relevant.length) return { status: "skipped" };
  const dayOf = r => String(r.video_path).match(/\/autopilot\/(\d{4}-\d{2}-\d{2})-/)[1];
  const day = relevant.map(dayOf).sort().at(-1);
  const rows = await q(`select * from publish_queue where user_id=$1 and platform=$2 and video_path like $3 order by publish_at asc nulls last, id asc limit 50`, [userId, platform, `%/autopilot/${day}-%`]);
  if (!Array.isArray(rows) || rows.length >= 50) throw new Error("تعذّر مراجعة أهداف اليوم");
  const sameTarget = r => !r.connection_id || String(r.connection_id) === String(conn.id);
  const group = rows.filter(sameTarget);
  if (group.some(r => r.status === "published" || r.status === "publishing" || r.status === "scheduled" || (r.status === "failed" && !safeAuthFailure(r.error)))) return { status: "skipped" };
  // صفان مختلفان قد يحجزهما الإنقاذ والربط بالتوازي؛ نرفض بدل رفعين للهدف نفسه.
  if (group.filter(r => r.status === "failed").length !== 1) return { status: "skipped" };
  const chosen = group.find(r => r.status === "failed" && relevant.some(c => c.id === r.id && dayOf(c) === day));
  if (!chosen) return { status: "skipped" };
  // الحجز داخل publishRow يمنع تنافس طلبين على الصف نفسه؛ القناة تُراجع بعد الحجز أيضًا.
  const out = await publishRow(chosen, platform, { expectedConnectionId: conn.id });
  if (out.ok) {
    // لا نعلن اكتمال اليوم طالما هناك أهداف أخرى تنتظر أو فشلت.
    try {
      const dailyRows = await q(`select id, platform, status from publish_queue where user_id=$1 and video_path like $2 limit 50`, [userId, `%/autopilot/${day}-%`]);
      const complete = Array.isArray(dailyRows) && dailyRows.length < 50 && config.all_channels !== true &&
        dailyRows.length > 0 && dailyRows.every(r => r.status === "published") &&
        config.platforms.every(p => dailyRows.some(r => r.platform === p && r.status === "published"));
      if (complete) {
        await q(`update autopilot_runs set status='published', external_url=$3, error=null, completed_at=now() where user_id=$1 and run_date=$2 and status <> 'published'`, [userId, day, out.url || ""]);
      }
    } catch { /* الرفع نجح؛ فشل تحديث السجل لا يُحوّل النتيجة إلى فشل. */ }
  }
  return { status: out.ok ? "published" : "failed", url: out.url || null };
}

module.exports = { resumeAfterRelink, safeAuthFailure };

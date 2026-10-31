/* Account dashboard API: safe settings, private run history, and manual generation. */
const { getUserId } = require("../lib/sess");
const { q1, rest } = require("../lib/db");
const { json } = require("../lib/oauth");
const { RECITERS, CONTENT_MODES, BACKGROUND_IDS, parseTemplate, generateAndPublish } = require("../lib/autopilot");

const DEFAULTS = { enabled: false, at_utc: "04:15:00", platforms: ["youtube"], template: { content_mode: "mix", reciter_mode: "rotate", background: "rotate", privacy: "public" } };

async function readBody(req) {
  let text = "";
  for await (const part of req) {
    text += part;
    if (text.length > 20000) throw new Error("الطلب أكبر من المسموح");
  }
  try { return JSON.parse(text || "{}"); } catch { throw new Error("بيانات غير صالحة"); }
}
async function accountData(uid) {
  const config = await q1(`select * from autopilot where user_id=$1 limit 1`, [uid]);
  const rawRuns = await rest(`/rest/v1/autopilot_runs?user_id=eq.${encodeURIComponent(uid)}&run_type=eq.daily&select=id,run_type,run_date,status,recipe_key,reciter,title,external_url,error,created_at,completed_at,publish_queue_id&order=created_at.desc&limit=50`);
  const runs = Array.isArray(rawRuns) ? rawRuns : [];
  const queueIds = [...new Set(runs.map(r => r.publish_queue_id).filter(Boolean))];
  let queuedMedia = [];
  if (queueIds.length) {
    const params = new URLSearchParams({
      user_id: `eq.${uid}`,
      id: `in.(${queueIds.join(",")})`,
      select: "id,caption,hashtags,video_name,external_url,status",
    });
    try { queuedMedia = await rest(`/rest/v1/publish_queue?${params.toString()}`); } catch {}
  }
  const mediaById = new Map((Array.isArray(queuedMedia) ? queuedMedia : []).map(r => [String(r.id), r]));
  const connection = await q1(`select account_name from social_connections where user_id=$1 and platform='youtube' limit 1`, [uid]);
  return {
    config: config ? { ...config, template: parseTemplate(config.template) } : DEFAULTS,
    runs: runs.map(run => {
      const media = mediaById.get(String(run.publish_queue_id)) || {};
      return {
        ...run,
        caption: media.caption || "",
        hashtags: media.hashtags || "",
        video_name: media.video_name || "",
        queue_status: media.status || "",
        external_url: run.external_url || media.external_url || null,
      };
    }),
    connected: !!connection,
    channel: connection?.account_name || "",
    reciters: RECITERS,
  };
}

module.exports = async (req, res) => {
  const uid = await getUserId(req);
  if (!uid) return json(res, 401, { error: "سجّل الدخول أولًا" });
  try {
    if (req.method === "GET") return json(res, 200, await accountData(uid));
    if (req.method !== "POST") return json(res, 405, { error: "method" });
    const body = await readBody(req);

    if (body.action === "save") {
      const templateInput = body.template && typeof body.template === "object" ? body.template : {};
      const content_mode = CONTENT_MODES.has(templateInput.content_mode) ? templateInput.content_mode : "mix";
      const background = BACKGROUND_IDS.has(templateInput.background) ? templateInput.background : "rotate";
      const enabled = body.enabled === true;
      if (enabled) {
        const connected = await q1(`select id from social_connections where user_id=$1 and platform='youtube' limit 1`, [uid]);
        if (!connected) return json(res, 409, { error: "اربط قناة YouTube أولًا قبل تفعيل النشر الآلي" });
      }
      const template = { content_mode, reciter_mode: "rotate", background, privacy: "public" };
      const saved = await rest("/rest/v1/autopilot?on_conflict=user_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ user_id: uid, enabled, at_utc: "04:15:00", platforms: ["youtube"], template, updated_at: new Date().toISOString() }),
      });
      const config = Array.isArray(saved) ? saved[0] : saved;
      return json(res, 200, { ok: true, config: { ...config, template: parseTemplate(config?.template) } });
    }

    if (body.action === "run") {
      const active = await rest(`/rest/v1/autopilot_runs?user_id=eq.${encodeURIComponent(uid)}&status=eq.rendering&select=id&limit=1`);
      if (Array.isArray(active) && active.length) return json(res, 409, { error: "هناك فيديو قيد الإنشاء بالفعل" });
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const recent = await rest(`/rest/v1/autopilot_runs?user_id=eq.${encodeURIComponent(uid)}&run_type=eq.manual&created_at=gte.${encodeURIComponent(since)}&select=id&limit=3`);
      if (Array.isArray(recent) && recent.length >= 3) return json(res, 429, { error: "وصلت إلى الحد اليومي للإنشاء اليدوي؛ اترك للنشر الآلي موعده اليومي" });
      const config = await q1(`select * from autopilot where user_id=$1 limit 1`, [uid]);
      const result = await generateAndPublish(uid, { runType: "manual", config: config || DEFAULTS });
      return json(res, result.ok ? 200 : 502, result);
    }
    return json(res, 400, { error: "إجراء غير معروف" });
  } catch (error) {
    return json(res, 500, { error: String(error?.message || error).slice(0, 300) });
  }
};

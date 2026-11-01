/* Account dashboard API: safe settings, private run history, and manual generation. */
const { getUserId } = require("../lib/sess");
const { q, q1, rest } = require("../lib/db");
const { json } = require("../lib/oauth");
function autopilotLib() { return require("../lib/autopilot"); }

const DAILY_COUNT_MAX = 3;
const DEFAULTS = { enabled: false, at_utc: "04:15:00", platforms: ["youtube"], daily_count: 1, youtube_connection_ids: [], template: { content_mode: "mix", purpose: "general", custom_message: "", video_style: "rotate", reciter_mode: "rotate", reciter: "", background: "rotate", privacy: "public" } };

async function readBody(req) {
  let text = "";
  for await (const part of req) {
    text += part;
    if (text.length > 20000) throw new Error("الطلب أكبر من المسموح");
  }
  try { return JSON.parse(text || "{}"); } catch { throw new Error("بيانات غير صالحة"); }
}
async function accountData(uid) {
  const { RECITERS, parseTemplate } = autopilotLib();
  const config = await q1(`select enabled, at_utc, platforms, template, daily_count, youtube_connection_ids, updated_at from autopilot where user_id=$1 limit 1`, [uid]);
  const rawRuns = await rest(`/rest/v1/autopilot_runs?user_id=eq.${encodeURIComponent(uid)}&run_type=eq.daily&select=id,run_type,run_date,status,step,daily_index,daily_total,channel_name,youtube_connection_id,recipe_key,reciter,title,external_url,error,created_at,completed_at,publish_queue_id&order=created_at.desc&limit=100`);
  const runs = Array.isArray(rawRuns) ? rawRuns : [];
  const queueIds = [...new Set(runs.map(r => String(r.publish_queue_id || "")).filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))];
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
  const channels = await q(`select id, account_name from social_connections where user_id=$1 and platform='youtube' order by account_name, created_at`, [uid]);
  return {
    config: config ? { ...config, template: parseTemplate(config.template) } : DEFAULTS,
    channels: Array.isArray(channels) ? channels : [],
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
    connected: Array.isArray(channels) && channels.length > 0,
    channel: Array.isArray(channels) && channels.length === 1 ? channels[0].account_name : (Array.isArray(channels) && channels.length ? `${channels.length} قنوات مرتبطة` : ""),
    reciters: RECITERS,
  };
}

module.exports = async (req, res) => {
  try {
    const uid = await getUserId(req);
    if (!uid) return json(res, 401, { error: "سجّل الدخول أولًا" });
    const { RECITERS, CONTENT_MODES, CONTENT_PURPOSES, VIDEO_STYLES, BACKGROUND_IDS, parseTemplate, generateAndPublish } = autopilotLib();
    if (req.method === "GET") return json(res, 200, await accountData(uid));
    if (req.method !== "POST") return json(res, 405, { error: "method" });
    const body = await readBody(req);

    if (body.action === "save") {
      const templateInput = body.template && typeof body.template === "object" ? body.template : {};
      const content_mode = CONTENT_MODES.has(templateInput.content_mode) ? templateInput.content_mode : "mix";
      const purpose = CONTENT_PURPOSES.has(templateInput.purpose) ? templateInput.purpose : "general";
      const video_style = VIDEO_STYLES.has(templateInput.video_style) ? templateInput.video_style : "rotate";
      const custom_message = typeof templateInput.custom_message === "string" ? templateInput.custom_message.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 180) : "";
      const background = BACKGROUND_IDS.has(templateInput.background) ? templateInput.background : "rotate";
      const selectedReciter = RECITERS.find(reciter => reciter.id === templateInput.reciter);
      const reciter_mode = templateInput.reciter_mode === "fixed" ? "fixed" : "rotate";
      if (reciter_mode === "fixed" && !selectedReciter) return json(res, 400, { error: "اختر قارئًا صالحًا أو فعّل التدوير التلقائي" });
      const reciter = reciter_mode === "fixed" ? selectedReciter.id : "";
      const enabled = body.enabled === true;
      const daily_count = Number(body.daily_count ?? 1);
      if (!Number.isInteger(daily_count) || daily_count < 1 || daily_count > DAILY_COUNT_MAX) {
        return json(res, 400, { error: `عدد الفيديوهات اليومي يجب أن يكون بين 1 و${DAILY_COUNT_MAX}` });
      }
      const connected = await q(`select id from social_connections where user_id=$1 and platform='youtube'`, [uid]);
      const validIds = new Set((Array.isArray(connected) ? connected : []).map(x => String(x.id)));
      const requestedIds = Array.isArray(body.youtube_connection_ids)
        ? [...new Set(body.youtube_connection_ids.map(String))]
        : [...validIds];
      if (requestedIds.some(id => !validIds.has(id))) return json(res, 400, { error: "اختيار قناة غير صالح؛ حدّث القائمة وحاول مرة أخرى" });
      if (enabled && !requestedIds.length) return json(res, 409, { error: "اربط واختر قناة YouTube واحدة على الأقل قبل تفعيل النشر الآلي" });
      const template = { content_mode, purpose, custom_message, video_style, reciter_mode, reciter, background, privacy: "public" };
      const saved = await rest("/rest/v1/autopilot?on_conflict=user_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          user_id: uid, enabled, at_utc: "04:15:00", platforms: ["youtube"],
          daily_count, youtube_connection_ids: requestedIds, template, updated_at: new Date().toISOString(),
        }),
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

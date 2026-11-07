/* Account dashboard API: safe settings, private run history, and manual generation. */
const { getUserId } = require("../lib/sess");
const { q1, rest } = require("../lib/db");
const { json } = require("../lib/oauth");
const { RECITERS, CONTENT_MODES, BACKGROUND_IDS, parseTemplate, generateAndPublish } = require("../lib/autopilot");

// دعم جميع المنصات (تعدد القنوات)
const PLATFORMS = {
  youtube: "يوتيوب",
  facebook: "فيسبوك",
  instagram: "إنستغرام",
  tiktok: "تيك توك",
  x: "X",
  linkedin: "لينكد إن",
  telegram: "تيليجرام",
  whatsapp: "واتساب"
};

const DEFAULTS = {
  enabled: false,
  at_utc: "04:15:00", // 06:15 القاهرة (UTC+2)
  platforms: ["youtube"],
  template: { content_mode: "mix", reciter_mode: "rotate", background: "rotate", privacy: "public" }
};

async function readBody(req) {
  let text = "";
  for await (const part of req) {
    text += part;
    if (text.length > 20000) throw new Error("الطلب أكبر من المسموح");
  }
  try { return JSON.parse(text || "{}"); } catch { throw new Error("بيانات غير صالحة"); }
}

// دعم توليد البوست من المقالات (10,000 مقال)
async function articleRandom(uid) {
  const articles = await rest(`/rest/v1/articles?select=id,title&limit=10000`);
  if (!Array.isArray(articles) || !articles.length) return null;
  return articles[Math.floor(Math.random() * articles.length)];
}

async function accountData(uid) {
  const config = await q1(`select * from autopilot where user_id=$1 limit 1`, [uid]);
  const runs = await rest(`/rest/v1/autopilot_runs?user_id=eq.${encodeURIComponent(uid)}&select=id,run_type,run_date,status,recipe_key,reciter,title,external_url,error,created_at,completed_at,article_id,article_title&order=created_at.desc&limit=12`);
  // دعم تعدد القنوات
  const connections = await rest(`/rest/v1/social_connections?user_id=eq.${encodeURIComponent(uid)}&select=id,platform,account_name`);
  const connectedPlatforms = Array.isArray(connections) ? connections.map(c => c.platform) : [];
  const channelNames = Array.isArray(connections) ? connections.map(c => `${PLATFORMS[c.platform] || c.platform} · ${c.account_name}`).join(" | ") : "";

  return {
    config: config ? { ...config, template: parseTemplate(config.template) } : DEFAULTS,
    runs: Array.isArray(runs) ? runs : [],
    connected: connectedPlatforms.length > 0,
    platforms: connectedPlatforms,
    channel: channelNames || "لا توجد قنوات مرتبطة",
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
      
      // دعم تعدد القنوات
      const platforms = Array.isArray(body.platforms) && body.platforms.length > 0 ? body.platforms : ["youtube"];
      
      if (enabled) {
        const connected = await rest(`/rest/v1/social_connections?user_id=eq.${encodeURIComponent(uid)}&platform=in.(${platforms.map(p => `'${p}'`).join(',')})&select=id&limit=1`);
        if (!Array.isArray(connected) || connected.length === 0) return json(res, 409, { error: "اربط قناة واحدة على الأقل قبل تفعيل النشر الآلي" });
      }
      
      const template = { content_mode, reciter_mode: "rotate", background, privacy: "public" };
      const saved = await rest("/rest/v1/autopilot?on_conflict=user_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ user_id: uid, enabled, at_utc: "04:15:00", platforms, template, updated_at: new Date().toISOString() }),
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

    // دعم التوازي (run_all)
    if (body.action === "run_all") {
      const active = await rest(`/rest/v1/autopilot_runs?user_id=eq.${encodeURIComponent(uid)}&status=eq.rendering&select=id&limit=1`);
      if (Array.isArray(active) && active.length) return json(res, 409, { error: "هناك فيديو قيد الإنشاء بالفعل" });
      
      const config = await q1(`select * from autopilot where user_id=$1 limit 1`, [uid]);
      const platforms = (config?.platforms || DEFAULTS.platforms).filter(p => PLATFORMS[p]);
      if (platforms.length === 0) return json(res, 409, { error: "لا توجد قنوات مرتبطة لتشغيل التوازي" });
      
      // تشغيل التوازي (Promise.all)
      const results = await Promise.all(platforms.map(platform => 
        generateAndPublish(uid, { runType: "manual", config: { ...config, platforms: [platform] } })
      ));
      
      const ok = results.every(r => r.ok);
      return json(res, ok ? 200 : 502, { ok, results });
    }

    // دعم توليد البوست من المقالات
    if (body.action === "article_random") {
      const article = await articleRandom(uid);
      if (!article) return json(res, 404, { error: "لا توجد مقالات متاحة" });
      
      const config = await q1(`select * from autopilot where user_id=$1 limit 1`, [uid]);
      const result = await generateAndPublish(uid, { runType: "manual", config: config || DEFAULTS, article });
      return json(res, result.ok ? 200 : 502, { ...result, article_id: article.id, article_title: article.title });
    }

    return json(res, 400, { error: "إجراء غير معروف" });
  } catch (error) {
    return json(res, 500, { error: String(error?.message || error).slice(0, 300) });
  }
};

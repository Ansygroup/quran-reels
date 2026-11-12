/* قائمة المنصات المرتبطة (بدون أي توكن في الاستجابة) */
const { getUserId } = require("./sess");
const { q } = require("./db");
const { open } = require("./crypt");
const { readRefreshToken } = require("./refresh_token");
const { json } = require("./oauth");

module.exports = async (req, res) => {
  if (req.method !== "GET") return json(res, 405, { error: "method" });
  const uid = await getUserId(req);
  if (!uid) return json(res, 401, { error: "unauthorized" });
  /* نقرأ عمود refresh_token نفسه لأن PostgREST لا يقبل تعبيرات SQL في select،
   * ثم نحوّله إلى منطقي هنا ولا نُخرجه في الاستجابة أبدًا. (التعبير السابق
   * كان يُرسَل حرفيًا فيُرجع 400 ويُعطّل بطاقة القنوات كلها.) */
  const rows = await q(`select id, platform, account_id, account_name, meta, scopes, expires_at, updated_at, is_default, refresh_token from social_connections where user_id=$1 order by platform, updated_at desc`, [uid]);
  const out = rows.map(r => {
    let extra = {};
    try {
      const m = JSON.parse(open(r.meta) || "{}");
      if (r.platform === "facebook") extra = { pages: (m.pages || []).map(p => p.name), ig: !!(m.pages || []).some(p => p.ig) };
      if (r.platform === "instagram") extra = { ig_id: m.ig_id ? "✓" : "", username: m.username || "" };
      if (r.platform === "youtube") extra = { channel: m.channel || "" };
      if (r.platform === "tiktok") extra = {};
      if (r.platform === "x") extra = { name: m.name || "" };
    } catch {}
    /* has_refresh منطقي فقط (لا توكن): صلاحية access_token تنتهي كل ساعة وتُجدَّد
     * تلقائيًا — التحذير يجب أن يكون عن غياب التجديد لا عن انتهاء الساعة */
    return { id: r.id, platform: r.platform, account_name: r.account_name, extra, scopes: r.scopes, expires_at: r.expires_at, updated_at: r.updated_at, is_default: Boolean(r.is_default), has_refresh: ["youtube", "tiktok", "x"].includes(r.platform) ? Boolean(readRefreshToken(r.refresh_token)) : null };
  });
  json(res, 200, { connections: out });
};

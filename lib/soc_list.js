/* قائمة المنصات المرتبطة (بدون أي توكن في الاستجابة) */
const { getUserId } = require("./sess");
const { q } = require("./db");
const { open } = require("./crypt");
const { json } = require("./oauth");

module.exports = async (req, res) => {
  if (req.method !== "GET") return json(res, 405, { error: "method" });
  const uid = await getUserId(req);
  if (!uid) return json(res, 401, { error: "unauthorized" });
  const rows = await q(`select id, platform, account_id, account_name, meta, scopes, expires_at, updated_at from social_connections where user_id=$1 order by platform, updated_at desc`, [uid]);
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
    return { id: r.id, platform: r.platform, account_name: r.account_name, extra, scopes: r.scopes, expires_at: r.expires_at, updated_at: r.updated_at };
  });
  json(res, 200, { connections: out });
};

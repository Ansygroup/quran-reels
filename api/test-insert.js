const { q } = require("../lib/db");
const { json } = require("../lib/oauth");
const { getUserId } = require("../lib/sess");

module.exports = async (req, res) => {
  const uid = await getUserId(req);
  if (!uid) return json(res, 401, { error: "no user" });
  try {
    await q(`insert into social_connections (user_id, platform, account_id, account_name, meta, access_token, refresh_token, expires_at, scopes, updated_at) values ($1,'youtube','test','Test',null,'test','test',9999999999999,'test',now())`, [uid]);
    json(res, 200, { ok: true, uid });
  } catch (e) {
    json(res, 500, { error: String(e.message || e), uid });
  }
};

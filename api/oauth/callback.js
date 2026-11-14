/* استقبال OAuth من المزوّدات — /api/oauth/callback?code&state (المنصة داخل state) */
const { json, failUrl } = require("../../lib/oauth");
const CB = {
  youtube: require("../../lib/cb_youtube"),
  meta: require("../../lib/cb_meta"),
  tiktok: require("../../lib/cb_tiktok"),
  x: require("../../lib/cb_x"),
};
module.exports = async (req, res) => {
  const u = new URL(req.url, "http://local");
  const st = u.searchParams.get("state") || "";
  const m = st.match(/^(youtube|meta|tiktok|x)\./);
  if (!m) { res.statusCode = 302; res.setHeader("Location", "/#/account?linked=err&w=state"); return res.end(); }
  // A flow started before this release must not exchange a code or change
  // connections after TikTok is made unavailable.
  if (m[1] === "tiktok") { res.statusCode = 302; res.setHeader("Location", failUrl("tiktok", "unavailable")); return res.end(); }
  return CB[m[1]](req, res);
};

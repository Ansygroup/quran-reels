/* مسار اجتماعي موحّد: list | disconnect | default — يُخدَم عبر /api/gw?op=list|disconnect
 * (والرابط القديم /api/social?op=… يعمل عبر rewrite في vercel.json) */
const { json } = require("../lib/oauth");
const LIST = require("../lib/soc_list");
const DISC = require("../lib/soc_disconnect");
const DEF = require("../lib/soc_default");

module.exports = async (req, res) => {
  const u = new URL(req.url, "http://local");
  const op = u.searchParams.get("op") || "";
  if (op === "list") return LIST(req, res);
  if (op === "disconnect") return DISC(req, res);
  if (op === "default") return DEF(req, res);
  json(res, 404, { error: "unknown op" });
};

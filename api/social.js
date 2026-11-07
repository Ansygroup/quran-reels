/* مسار اجتماعي موحّد: list | disconnect */
const { json } = require("../lib/oauth");
const LIST = require("../lib/soc_list");
const DISC = require("../lib/soc_disconnect");

module.exports = async (req, res) => {
  const u = new URL(req.url, "http://local");
  const op = u.searchParams.get("op") || "";
  if (op === "list") return LIST(req, res);
  if (op === "disconnect") return DISC(req, res);
  json(res, 404, { error: "unknown op" });
};

/* بدء ربط OAuth — يُخدَم عبر /api/gw?op=start&p=<platform>&t=<access_token>
 * (والرابط القديم /api/oauth?op=start يعمل عبر rewrite في vercel.json) */
const { handleStart, json } = require("../lib/oauth");

module.exports = async (req, res) => {
  const u = new URL(req.url, "http://local");
  const op = u.searchParams.get("op") || "";
  const p = u.searchParams.get("p") || "";
  if (op !== "start") return json(res, 404, { error: "unknown op" });
  /* facebook وinstagram يتشاركان تطبيق Meta — نقبل الاسمين حتى لا يفشل
   * الرابط القادم من الواجهة أو من رابط قديم محفوظ في الـService Worker. */
  const prov = p === "facebook" || p === "instagram" ? "meta" : p;
  if (!["youtube", "meta", "tiktok", "x"].includes(prov)) return json(res, 404, { error: "unknown platform", platforms: ["youtube", "facebook", "instagram", "meta", "tiktok", "x"] });
  return handleStart(req, res, prov);
};

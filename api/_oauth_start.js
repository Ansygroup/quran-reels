/* بدء ربط OAuth — يُخدَم عبر /api/gw?op=start&p=<platform>&t=<access_token>
 * (والرابط القديم /api/oauth?op=start يعمل عبر rewrite في vercel.json) */
const { handleStart, json } = require("../lib/oauth");

module.exports = async (req, res) => {
  const u = new URL(req.url, "http://local");
  const op = u.searchParams.get("op") || "";
  const p = u.searchParams.get("p") || "";
  if (op !== "start") return json(res, 404, { error: "unknown op" });
  if (!["GET", "POST"].includes(req.method)) return json(res, 405, { error: "method" });
  // POST must authenticate by header, never by a token in the URL.
  if (req.method === "POST" && (!/^Bearer\s+\S+$/i.test(String(req.headers?.authorization || "")) || u.searchParams.has("t"))) return json(res, 401, { error: "سجل الدخول أولًا" });
  /* facebook وinstagram يتشاركان تطبيق Meta — نقبل الاسمين حتى لا يفشل
   * الرابط القادم من الواجهة أو من رابط قديم محفوظ في الـService Worker. */
  const prov = p === "facebook" || p === "instagram" ? "meta" : p;
  if (prov === "tiktok" || prov === "meta") return json(res, 403, { error: `${prov === "meta" ? "فيسبوك وإنستغرام" : "تيك توك"} قريبًا — الربط غير متاح حاليًا` });
  if (!["youtube", "meta", "tiktok", "x"].includes(prov)) return json(res, 404, { error: "unknown platform", platforms: ["youtube", "facebook", "instagram", "meta", "tiktok", "x"] });
  return handleStart(req, res, prov);
};

/* مراقبة + شبكة أمان يومية (Vercel Cron — 10:15 UTC = 13:15 القاهرة)
 * ------------------------------------------------------------
 * الخطة تسمح بكرون واحد للنشر يوميًا (04:15 UTC)، فأي فشل مزدوج يعني
 * يومًا بلا فيديو. هنا — إن غاب تشغيل اليوم أو فشل — نُشغّل محاولة إنقاذ
 * واحدة (catchUpDaily) بلا أي تدخّل بشري.
 * فحص الموقع الكامل (sitemap + كل الروابط + robots/llms + المنافسون)
 * يبقى أيام الاثنين فقط لتوفير الوقت، أو عند ?full=1.
 */
const { json } = require("../../lib/oauth");
const { checkOwn, sitemapCount } = require("../../lib/monitor");
const { catchUpDaily } = require("../../lib/autopilot");

const COMPETITORS = ["quranreels.tech", "tashghil.pro", "quranvideomaker.com"];

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET || "";
  if (secret && (req.headers.authorization || "") !== `Bearer ${secret}`) {
    return json(res, 401, { error: "unauthorized" });
  }
  const base = (process.env.SITE_ORIGIN || "https://quran-reels-tau.vercel.app").replace(/\/+$/, "");

  /* 1) شبكة الأمان أولًا: إن لم يُنشر اليوم شيء نُنشئ وننشر الآن */
  let rescue = [];
  try { rescue = await catchUpDaily(); }
  catch (e) { rescue = [{ ok: false, error: String((e && e.message) || e).slice(0, 200) }]; }

  const url = new URL(req.url || "/", "http://local");
  const full = url.searchParams.get("full") === "1" || new Date().getUTCDay() === 1;
  if (!full) {
    return json(res, 200, { ok: true, day: "rescue-only", rescue, at: new Date().toISOString() });
  }

  const own = await checkOwn(base, { limit: 10 });

  const competitors = {};
  await Promise.all(COMPETITORS.map(async h => {
    const s = await sitemapCount(h, 12000);
    competitors[h] = s.ok ? s.count : "unreachable:" + (s.status || s.error);
  }));

  const ok = !!(own.sitemap && own.sitemap.ok)
    && (!own.urls || own.urls.bad.length === 0)
    && own.robots && own.robots.ok && own.robots.hasSitemap
    && own.llms && own.llms.ok
    && own.home && own.home.ok && own.home.verification;

  json(res, ok ? 200 : 503, {
    ok,
    base,
    rescue,
    at: new Date().toISOString(),
    sitemap: own.sitemap,
    checked: own.urls ? own.urls.total : 0,
    bad: own.urls ? own.urls.bad.map(b => ({ status: b.status, url: b.url })) : [],
    robots: own.robots,
    llms: own.llms,
    home: own.home,
    competitors,
  });
};

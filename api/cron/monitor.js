/* مراقبة أسبوعية (Vercel Cron — الاثنين 06:30 UTC) — كمل#14
 * ذاتي (sitemap + كل الروابط + robots/llms) + عدّ مداخل منافسين.
 * الـdiff الكامل والتقرير اليومي في السكربت المحلي: npm run monitor
 */
const { json } = require("../../lib/oauth");
const { checkOwn, sitemapCount } = require("../../lib/monitor");

const COMPETITORS = ["quranreels.tech", "tashghil.pro", "quranvideomaker.com"];

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET || "";
  if (secret && (req.headers.authorization || "") !== `Bearer ${secret}`) {
    return json(res, 401, { error: "unauthorized" });
  }
  const base = (process.env.SITE_ORIGIN || "https://quran-reels-tau.vercel.app").replace(/\/+$/, "");

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

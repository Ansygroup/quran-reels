// Public runtime config (anon/public values only) — lets the static app discover
// Supabase settings injected via Vercel environment variables.
// Empty values => the app silently uses its local-only fallback mode.
module.exports = (req, res) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  res.end(
    JSON.stringify({
      supabase: {
        url: process.env.SUPABASE_URL || "",
        anon: process.env.SUPABASE_ANON_KEY || "",
      },
    })
  );
};

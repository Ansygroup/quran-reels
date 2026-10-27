// Public IP geolocation for default prayer/qibla location — mirror of server.py /api/ip.
// Order: (1) Vercel edge geo headers (free, no external call, no rate limit)
//        (2) ipapi.co fallback with 8s timeout
//        (3) exact same Cairo fallback body as the Python server.
// Browser cache 1h; no CDN s-maxage (per-visitor data).
function sendJson(res, body) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.end(body);
}

module.exports = async (req, res) => {
  const fallback = '{"country_name":"Egypt","city":"","latitude":30.0444,"longitude":31.2357}';

  // 1) Vercel geo headers (present on requests terminated by Vercel's edge)
  try {
    const lat = req.headers["x-vercel-ip-latitude"];
    const lng = req.headers["x-vercel-ip-longitude"];
    if (lat && lng && isFinite(parseFloat(lat)) && isFinite(parseFloat(lng))) {
      let city = req.headers["x-vercel-ip-city"] || "";
      try { city = decodeURIComponent(city); } catch {}
      const cc = (req.headers["x-vercel-ip-country"] || "").toUpperCase();
      let country = "";
      try { country = new Intl.DisplayNames(["en"], { type: "region" }).of(cc) || ""; } catch {}
      if (!country || country === cc) country = cc;
      return sendJson(
        res,
        JSON.stringify({
          country_name: country,
          city: String(city).slice(0, 80),
          latitude: parseFloat(lat),
          longitude: parseFloat(lng),
          source: "vercel-geo",
        })
      );
    }
  } catch {}

  // 2) ipapi.co, 3) Cairo fallback
  try {
    const r = await fetch("https://ipapi.co/json/", {
      headers: { "User-Agent": "quran-reels/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const body = await r.text();
    return sendJson(res, body);
  } catch {
    return sendJson(res, fallback);
  }
};

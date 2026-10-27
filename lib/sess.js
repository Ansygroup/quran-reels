/* التحقق من جلسة المستخدم: JWT Supabase (ES256 عبر JWKS) — بدون مفتاح خدمة */
const crypto = require("crypto");

let jwks = null, jwksAt = 0;

async function getKey(kid) {
  if (!jwks || Date.now() - jwksAt > 3600e3) {
    const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
    jwks = await r.json();
    jwksAt = Date.now();
  }
  const k = (jwks.keys || []).find(x => x.kid === kid);
  if (!k) throw new Error("unknown kid");
  return crypto.createPublicKey({ key: k, format: "jwk" });
}

async function getUserId(req) {
  try {
    const h = req.headers.authorization || req.headers.Authorization || "";
    let m = String(h).match(/^Bearer\s+(.+)$/);
    let token = m && m[1];
    if (!token) { // رابط بدء الربط يمرّر التوكن في الاستعلام
      try { token = new URL(req.url, "http://local").searchParams.get("t"); } catch {}
    }
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = JSON.parse(Buffer.from(parts[0], "base64url"));
    const payload = JSON.parse(Buffer.from(parts[1], "base64url"));
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    const pub = await getKey(header.kid);
    const ok = crypto.verify(
      "sha256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      { key: pub, dsaEncoding: "ieee-p1363" },
      Buffer.from(parts[2], "base64url")
    );
    if (!ok) return null;
    return payload.sub || null;
  } catch { return null; }
}

module.exports = { getUserId };

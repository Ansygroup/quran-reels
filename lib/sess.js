/* التحقق من جلسة المستخدم.
 * يقبل نوعين من الـJWT:
 *  1) Firebase ID token (RS256، شهادات securetoken) — الواجهة تسجّل الدخول بـFirebase Auth.
 *     معرّف Firebase نصّ وليس uuid، فيُحوَّل إلى uuid v5 ثابت لأن أعمدة user_id في الجداول uuid.
 *  2) Supabase JWT (ES256 عبر JWKS) — جلسات قديمة؛ يبقى كما كان. */
const crypto = require("crypto");

const FIREBASE_PROJECT = () => process.env.FIREBASE_PROJECT_ID || "booming-banner-477420-h3";
const FB_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const UID_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

let jwks = null, jwksAt = 0;
let fbCerts = null, fbCertsAt = 0;

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

async function getFirebaseKey(kid) {
  if (!fbCerts || Date.now() - fbCertsAt > 3600e3 || !fbCerts[kid]) {
    const r = await fetch(FB_CERTS_URL);
    if (!r.ok) throw new Error("certs");
    fbCerts = await r.json();
    fbCertsAt = Date.now();
  }
  const pem = fbCerts[kid];
  if (!pem) throw new Error("unknown kid");
  return crypto.createPublicKey(pem);
}

/* uuid v5 (SHA-1) من معرّف Firebase: ثابت ولا يتصادم مع uuid الحقيقي لـSupabase */
function firebaseUidToUuid(uid) {
  const ns = Buffer.from(UID_NAMESPACE.replace(/-/g, ""), "hex");
  const h = crypto.createHash("sha1").update(ns).update("firebase:" + uid, "utf8").digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
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
    const now = Date.now();
    if (!payload.exp || payload.exp * 1000 < now) return null;
    const data = Buffer.from(`${parts[0]}.${parts[1]}`);
    const sig = Buffer.from(parts[2], "base64url");
    if (header.alg === "RS256") {
      const project = FIREBASE_PROJECT();
      if (payload.aud !== project || payload.iss !== `https://securetoken.google.com/${project}`) return null;
      if (payload.iat && payload.iat * 1000 > now + 5 * 60e3) return null;
      if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128) return null;
      const pub = await getFirebaseKey(header.kid);
      if (!crypto.verify("RSA-SHA256", data, pub, sig)) return null;
      return firebaseUidToUuid(payload.sub);
    }
    if (header.alg !== "ES256") return null;
    const pub = await getKey(header.kid);
    const ok = crypto.verify("sha256", data, { key: pub, dsaEncoding: "ieee-p1363" }, sig);
    if (!ok) return null;
    return payload.sub || null;
  } catch { return null; }
}

module.exports = { getUserId, firebaseUidToUuid };

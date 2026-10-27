/* تشفير/توقيع مشفّرات — AES-256-GCM + HMAC (مفتاح TOKEN_ENC_KEY فقط في الخادم) */
const crypto = require("crypto");

function key() {
  const k = process.env.TOKEN_ENC_KEY;
  if (!k) throw new Error("TOKEN_ENC_KEY missing");
  return crypto.createHash("sha256").update(k).digest();
}

function seal(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(String(text), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64url");
}

function open(sealed) {
  const b = Buffer.from(String(sealed), "base64url");
  if (b.length < 29) throw new Error("bad sealed");
  const iv = b.subarray(0, 12), tag = b.subarray(12, 28), enc = b.subarray(28);
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

function sign(v) {
  return crypto.createHmac("sha256", key()).update(String(v)).digest("base64url");
}
function unsign(v, sig) {
  const want = sign(v);
  try { return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig)); } catch { return false; }
}

module.exports = { seal, open, sign, unsign };

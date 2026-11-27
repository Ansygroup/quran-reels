/* التحقق من توكنات Firebase: صالح، منتهٍ، مشروع خاطئ، توقيع مزوّر، وتحويل uid إلى uuid ثابت. */
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fbs-"));
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", dir + "/k.pem", "-out", dir + "/c.pem", "-days", "2", "-subj", "/CN=test"], { stdio: "ignore" });
const keyPem = fs.readFileSync(dir + "/k.pem", "utf8"), certPem = fs.readFileSync(dir + "/c.pem", "utf8");
process.env.FIREBASE_PROJECT_ID = "booming-banner-477420-h3";
global.fetch = async () => ({ ok: true, json: async () => ({ kid1: certPem }) });
const { getUserId, firebaseUidToUuid } = require("../lib/sess");
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
function tok(over = {}, signKey = keyPem) {
  const now = Math.floor(Date.now() / 1000);
  const p = { iss: "https://securetoken.google.com/booming-banner-477420-h3", aud: "booming-banner-477420-h3", sub: "abcDEF123uid", iat: now - 10, exp: now + 3600, ...over };
  const h = b64({ alg: "RS256", kid: "kid1", typ: "JWT" });
  const body = h + "." + b64(p);
  return body + "." + crypto.sign("RSA-SHA256", Buffer.from(body), signKey).toString("base64url");
}
const req = t => ({ headers: { authorization: "Bearer " + t }, url: "/api/autopilot" });
(async () => {
  const bad = [];
  const ok = await getUserId(req(tok()));
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(ok || "")) bad.push("valid token should give a v5 uuid: " + ok);
  if (ok !== firebaseUidToUuid("abcDEF123uid")) bad.push("uuid not stable");
  if (ok === (await getUserId(req(tok({ sub: "other" }))))) bad.push("different uid same uuid");
  if (await getUserId(req(tok({ exp: Math.floor(Date.now() / 1000) - 5 })))) bad.push("expired accepted");
  if (await getUserId(req(tok({ aud: "other-project" })))) bad.push("wrong aud accepted");
  if (await getUserId(req(tok({ iss: "https://securetoken.google.com/other" })))) bad.push("wrong iss accepted");
  const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" });
  if (await getUserId(req(tok({}, other)))) bad.push("forged signature accepted");
  if (await getUserId(req(tok({ sub: "" })))) bad.push("empty sub accepted");
  if (await getUserId({ headers: {}, url: "/" })) bad.push("no token accepted");
  const none = b64({ alg: "none" }) + "." + b64({ sub: "x", exp: 9999999999 }) + ".";
  if (await getUserId(req(none))) bad.push("alg none accepted");
  if (bad.length) { console.error("FAIL", bad); process.exit(1); }
  console.log("Firebase session PASS (10 checks)");
})();

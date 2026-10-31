const assert = require("node:assert/strict");

process.env.TOKEN_ENC_KEY = "oauth-state-test-key-not-for-production";
const { setStCookie, readStCookie, stCookieValid } = require("../lib/oauth");

function cookieValue(header, name = "youtube") {
  const prefix = `qr_${name}_st=`;
  const field = header.split(";")[0];
  assert.ok(field.startsWith(prefix), "state cookie name is correct");
  return field.slice(prefix.length);
}

const cookie = setStCookie({}, "youtube", "user-123", "youtube.nonce-value", { redirect: "account" });
const value = cookieValue(cookie);
const req = { headers: { cookie: `other=x; qr_youtube_st=${value}` } };
const state = readStCookie(req, "youtube");
assert.ok(state, "signed state payload can be recovered from callback cookie");
assert.equal(state.u, "user-123");
assert.equal(state.r, "youtube.nonce-value");
assert.equal(stCookieValid(req, "youtube", state), true, "valid state signature is accepted");
assert.equal(stCookieValid(req, "meta", state), false, "state cannot be reused across providers");

const alteredValue = value.replace(/^(.*?)\.(.)/, (_match, payload, firstSigChar) => `${payload}.${firstSigChar === "A" ? "B" : "A"}`);
const altered = { headers: { cookie: `qr_youtube_st=${alteredValue}` } };
assert.equal(readStCookie(altered, "youtube"), null, "tampered state cookie is rejected");
assert.equal(stCookieValid(altered, "youtube", state), false, "tampered signature is rejected");

console.log("OAUTH STATE COOKIE TEST OK");

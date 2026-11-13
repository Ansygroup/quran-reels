/* اختبار عامل الأوفلاين محليًا دون تحميل أي كود خارجي أو لمس الإنتاج. */
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

async function main() {
  const handlers = {}, added = [], deleted = [], puts = [];
  let skipped = false, claimed = false, unsubscribed = false, offline = false;
  const shell = { label: "offline shell", clone() { return this; }, ok: true, type: "basic" };
  const cache = { add: async request => { assert.equal(request.cache, "reload"); added.push(request.url); }, match: async () => shell, put: async (...args) => puts.push(args) };
  const caches = { open: async name => { assert.equal(name, "qr-v53"); return cache; }, keys: async () => ["qr-v52", "qr-v53"], delete: async k => { deleted.push(k); }, match: async () => shell };
  const self = { location: { origin: "https://example.test" }, registration: { pushManager: { getSubscription: async () => ({ unsubscribe: async () => { unsubscribed = true; } }) } }, clients: { claim: async () => { claimed = true; } }, skipWaiting: async () => { skipped = true; }, addEventListener: (name, fn) => { handlers[name] = fn; } };
  const code = fs.readFileSync("public/sw.js", "utf8");
  vm.runInNewContext(code, { self, caches, URL, Request: class { constructor(url, opts) { this.url = url; this.cache = opts.cache; } }, Response: { error: () => "error" }, fetch: async () => { if (offline) throw Error("offline"); return shell; } });
  let pending;
  handlers.install({ waitUntil: p => { pending = p; } }); await pending;
  assert(skipped && added.includes("/") && added.length >= 20);
  handlers.activate({ waitUntil: p => { pending = p; } }); await pending;
  assert.deepStrictEqual(deleted, ["qr-v52"]); assert(unsubscribed && claimed);
  // عدم توفر خدمة الإشعارات لا يعطّل التفعيل.
  self.registration.pushManager.getSubscription = async () => { throw Error("denied"); };
  claimed = false; handlers.activate({ waitUntil: p => { pending = p; } }); await pending; assert(claimed);
  offline = true;
  handlers.fetch({ request: { url: "https://example.test/some-page", method: "GET", mode: "navigate" }, respondWith: p => { pending = p; } });
  assert.strictEqual(await pending, shell);
  handlers.fetch({ request: { url: "https://example.test/css/style.css", method: "GET", mode: "no-cors" }, respondWith: p => { pending = p; } });
  assert.strictEqual(await pending, shell);
  for (const url of ["https://example.test/api/test", "https://example.test/proxy/test", "https://example.test/a.mp3", "https://other.test/x"]) {
    let intercepted = false;
    handlers.fetch({ request: { url, method: "GET" }, respondWith: () => { intercepted = true; } });
    assert(!intercepted, url);
  }
  console.log(`SW PASS: ${added.length} shell assets, cache upgrade, unsubscribe, offline fallback, network-only exclusions`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });

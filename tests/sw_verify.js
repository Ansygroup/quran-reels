/* اختبار عامل الأوفلاين محليًا دون تحميل أي كود خارجي أو لمس الإنتاج. */
"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

async function main() {
  const handlers = {}, fetched = [], deleted = [], puts = [], stored = new Map();
  let skipped = false, claimed = false, unsubscribed = false, offline = false;
  const makeResponse = (label, options = {}) => ({
    label, status: options.status ?? 200, ok: (options.status ?? 200) >= 200 && (options.status ?? 200) < 300,
    type: options.type ?? "basic", url: options.url ?? "https://example.test/", redirected: options.redirected ?? false,
    headers: { get: name => name.toLowerCase() === "content-type" ? (options.contentType ?? "text/html; charset=utf-8") : null },
    clone() { return this; },
  });
  let networkResponse = makeResponse("offline shell");
  const cache = {
    match: async key => stored.get(typeof key === 'string' ? key : key.url),
    put: async (key, value) => { puts.push([key, value]); stored.set(key, value); },
  };
  const caches = { open: async name => { assert.equal(name, "qr-v85"); return cache; }, keys: async () => ["qr-v84", "qr-v85"], delete: async k => { deleted.push(k); } };
  const self = { location: { origin: "https://example.test" }, registration: { pushManager: { getSubscription: async () => ({ unsubscribe: async () => { unsubscribed = true; } }) } }, clients: { claim: async () => { claimed = true; } }, skipWaiting: async () => { skipped = true; }, addEventListener: (name, fn) => { handlers[name] = fn; } };
  const code = fs.readFileSync("public/sw.js", "utf8");
  vm.runInNewContext(code, { self, caches, URL, Request: class { constructor(url, opts) { this.url = url; this.cache = opts.cache; } }, Response: { error: () => "error" }, fetch: async req => { if (offline) throw Error("offline"); if (req.cache === 'reload') { fetched.push(req.url); if (req.url === '/js/tools-a.js?v=5') return makeResponse('missing', {status:404}); } return networkResponse; } });
  let pending;
  handlers.install({ waitUntil: p => { pending = p; } }); await pending;
  assert(skipped && stored.get('/') === networkResponse && fetched.length >= 20);
  assert(!stored.has('/js/tools-a.js?v=5'), 'failed assets are not cached');
  handlers.activate({ waitUntil: p => { pending = p; } }); await pending;
  assert.deepStrictEqual(deleted, ["qr-v84"]); assert(unsubscribed && claimed);
  self.registration.pushManager.getSubscription = async () => { throw Error("denied"); };
  claimed = false; handlers.activate({ waitUntil: p => { pending = p; } }); await pending; assert(claimed);

  async function navigation(url) {
    let response; const waits = [];
    handlers.fetch({ request: { url, method: "GET", mode: "navigate" }, respondWith: p => { response = p; }, waitUntil: p => waits.push(p) });
    const result = await response; await Promise.all(waits); return result;
  }
  const shell = stored.get('/');
  networkResponse = makeResponse('article', {url:'https://example.test/faq/'});
  assert.strictEqual(await navigation('https://example.test/faq/'), networkResponse); assert.strictEqual(stored.get('/'), shell);
  networkResponse = makeResponse('query', {url:'https://example.test/?code=secret'});
  await navigation('https://example.test/?code=secret'); assert.strictEqual(stored.get('/'), shell);
  for (const opts of [{status:500}, {status:206}, {redirected:true, url:'https://example.test/faq/'}, {contentType:'application/json'}, {url:'https://example.test/?token=secret'}, {type:'opaque'}]) {
    networkResponse = makeResponse('unsafe', opts);
    assert.strictEqual(await navigation('https://example.test/'), networkResponse); assert.strictEqual(stored.get('/'), shell);
  }
  networkResponse = makeResponse('updated home');
  assert.strictEqual(await navigation('https://example.test/'), networkResponse); assert.strictEqual(stored.get('/'), networkResponse);
  offline = true;
  assert.strictEqual(await navigation('https://example.test/'), networkResponse);
  assert.strictEqual(await navigation('https://example.test/?x=1'), networkResponse);
  assert.strictEqual(await navigation('https://example.test/some-page'), 'error');
  stored.delete('/'); assert.strictEqual(await navigation('https://example.test/'), 'error');
  stored.set('https://example.test/css/style.css', shell);
  handlers.fetch({ request: { url: "https://example.test/css/style.css", method: "GET", mode: "no-cors" }, respondWith: p => { pending = p; } });
  assert.strictEqual(await pending, shell);
  for (const url of ["https://example.test/api/test", "https://example.test/proxy/test", "https://example.test/a.mp3", "https://other.test/x"]) {
    let intercepted = false;
    handlers.fetch({ request: { url, method: "GET" }, respondWith: () => { intercepted = true; } });
    assert(!intercepted, url);
  }
  console.log(`SW PASS: ${fetched.length} assets attempted, guarded shell, cache upgrade, unsubscribe, offline fallback, network-only exclusions`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });

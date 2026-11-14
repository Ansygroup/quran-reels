'use strict';
// Synthetic loopback servers only. No Supabase data, credentials, or external requests.
const assert = require('node:assert/strict');
const http = require('node:http');
const { rest } = require('../lib/db');
const listen = s => new Promise(resolve => s.listen(0, '127.0.0.1', resolve));
const close = s => new Promise(resolve => s.close(resolve));
(async () => {
  const forwarded = [], incoming = [];
  const destination = http.createServer((req, res) => { forwarded.push(req.headers); res.writeHead(200, {'content-type':'application/json'}).end('[]'); });
  await listen(destination);
  let mode = 'redirect';
  const source = http.createServer((req, res) => {
    incoming.push({method:req.method, path:req.url, apikey:req.headers.apikey});
    if (mode === 'redirect') return res.writeHead(307, {location:`http://127.0.0.1:${destination.address().port}/rest/v1/autopilot`}).end();
    res.writeHead(200, {'content-type':'application/json'}).end('[]');
  });
  await listen(source);
  try {
    process.env.SUPABASE_URL = `http://127.0.0.1:${source.address().port}`;
    process.env.SUPABASE_SERVICE_KEY = 'fixture-only';
    for (const opts of [{method:'GET'}, {method:'PATCH',body:'{}'}, {method:'GET',redirect:'follow'}]) {
      await assert.rejects(rest('/rest/v1/autopilot?limit=0', opts));
    }
    assert.equal(incoming.length, 3); assert(incoming.every(r=>r.apikey==='fixture-only'));
    assert.deepEqual(forwarded, [], 'credentials and writes must not follow a redirect');
    mode = 'ok';
    assert.deepEqual(await rest('/rest/v1/autopilot?limit=0', {method:'GET'}), []);
    console.log('PASS database REST refuses redirects, including caller override (synthetic loopback only)');
  } finally { await close(source); await close(destination); }
})().catch(e => { console.error(e); process.exitCode=1; });

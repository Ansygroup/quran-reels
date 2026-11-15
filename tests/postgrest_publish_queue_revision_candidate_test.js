'use strict';
// Disposable CI PostgREST only, with hypothetical cooperating SQL through
// lib/db. This does not exercise publishRow or contact a provider or Supabase.
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const BASE = 'http://127.0.0.1:3102', SECRET = 'LOCAL-ONLY-channel-fixture-secret-0123456789-abcdef';
const U = '11111111-1111-4111-8111-111111111111', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const Q = '99999999-9999-4999-8999-999999999999';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const payload = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ role: 'service_role', sub: U, exp: Math.floor(Date.now() / 1000) + 3600 });
const jwt = payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
const realFetch = global.fetch;
let dropNextPatch = false, dropped = 0, patches = [];
global.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  if (u.origin !== BASE) throw Error('external network blocked');
  if (u.pathname.startsWith('/rest/v1/')) u.pathname = u.pathname.slice('/rest/v1'.length);
  if (opts.method === 'PATCH') patches.push({ query: u.searchParams.toString(), body: opts.body });
  const response = await realFetch(u, { ...opts, signal: AbortSignal.timeout(10000) });
  if (dropNextPatch && opts.method === 'PATCH') { dropNextPatch = false; dropped++; await response.arrayBuffer(); throw Error('simulated lost successful response'); }
  return response;
};
process.env.SUPABASE_URL = BASE; process.env.SUPABASE_SERVICE_KEY = jwt;
const { q } = require('../lib/db');
async function req(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { authorization: 'Bearer ' + jwt, 'content-type': 'application/json', prefer: 'return=representation' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  assert(r.ok, `fixture response ${r.status}: ${text}`); return data;
}
async function ready() {
  for (let i = 0; i < 40; i++) {
    const r = await fetch(BASE + '/publish_queue?select=id,queue_revision&limit=0', { headers: { authorization: 'Bearer ' + jwt } });
    if (r.ok) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw Error('local PostgREST schema reload did not complete');
}
const claimSql = "update publish_queue set status='publishing' where id=$1 and user_id=$2 and status='scheduled' and platform=$3 and connection_id=$4 and queue_revision=$5 returning *";
const finishSql = "update publish_queue set status='published' where id=$1 and user_id=$2 and status='publishing' and queue_revision=$3 returning *";
const claim = row => q(claimSql, [row.id, U, row.platform, row.connection_id, row.queue_revision]);
(async () => {
  await ready();
  try {
    const [first] = await req('POST', '/publish_queue', { id: Q, user_id: U, platform: 'youtube', connection_id: B, status: 'scheduled' });
    assert.equal(typeof first.queue_revision, 'string');
    const [claimed] = await claim(first); assert.equal(claimed.status, 'publishing'); assert.notEqual(claimed.queue_revision, first.queue_revision);
    assert(patches[0].query.includes('queue_revision=eq.' + first.queue_revision));
    await req('PATCH', `/publish_queue?id=eq.${Q}`, { status: 'failed' });
    const [scheduled] = await req('PATCH', `/publish_queue?id=eq.${Q}`, { status: 'scheduled' });
    assert.notEqual(scheduled.queue_revision, first.queue_revision);
    assert.deepEqual(await claim(first), []);
    const [newer] = await claim(scheduled);
    assert.deepEqual(await q(finishSql, [Q, U, claimed.queue_revision]), []);
    const [finished] = await q(finishSql, [Q, U, newer.queue_revision]); assert.equal(finished.status, 'published');
    // Commit a claim but lose its response: callers cannot safely dispatch or
    // retry based on the missing token. This tests SQL transport, not app logic.
    const [again] = await req('PATCH', `/publish_queue?id=eq.${Q}`, { status: 'scheduled' });
    dropNextPatch = true; await assert.rejects(claim(again), /simulated lost/); assert.equal(dropped, 1);
    const [stored] = await req('GET', `/publish_queue?id=eq.${Q}&select=id,status,queue_revision`);
    assert.equal(stored.status, 'publishing'); assert.notEqual(stored.queue_revision, again.queue_revision);
    assert.deepEqual(await claim(again), []);
    console.log('PASS candidate revision through SQL translator and disposable PostgREST; no provider requests');
  } finally {
    await req('DELETE', `/publish_queue?id=eq.${Q}`).catch(() => {});
    global.fetch = realFetch;
  }
})().catch(e => { console.error(e); process.exitCode = 1; });

#!/usr/bin/env node
/* محاكاة PostgREST ووقت تعطل الشبكة، بلا أي مزود نشر حقيقي. */
const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://db.example';
process.env.SUPABASE_SERVICE_KEY = 'test';
let calls = [], run = { id: 'run1', status: 'rendering', video_path: null }, rows = [], mode = 'normal';
const respond = data => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => data, text: async () => '' });
global.fetch = async (url, opts = {}) => {
  const u = new URL(url), method = opts.method || 'GET', body = opts.body && JSON.parse(opts.body);
  calls.push({ path: u.pathname, method, body });
  if (u.pathname.endsWith('/autopilot_runs') && method === 'PATCH') { Object.assign(run, body); return respond([]); }
  if (u.pathname.endsWith('/autopilot_runs') && method === 'GET') return respond([{ ...run }]);
  if (u.pathname.endsWith('/publish_queue') && method === 'POST') {
    assert(Array.isArray(body));
    if (mode === 'reject') return { ok: false, status: 400, text: async () => 'rejected atomically' };
    rows.push(...body);
    if (mode === 'lost') throw new Error('connection lost after commit');
    if (mode === 'partial_response') return respond(body.slice(0, 1));
    return respond(body);
  }
  throw new Error(`unexpected ${method} ${url}`);
};
const { __test: T } = require('../lib/autopilot');
const targets = [{ platform: 'youtube', connection_id: 'c1' }, { platform: 'youtube', connection_id: 'c2' }];
const queue = () => T.queueTargets('run1', 'u1', 'u1/autopilot/2026-11-12-run1.mp4', 'r.mp4', targets, { s: 1, from: 1, to: 2 }, { name: 'قارئ' });
(async () => {
  const out = await queue();
  assert.equal(out.length, 2); assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(r => r.connection_id), ['c1', 'c2']);
  assert.equal(calls.filter(c => c.path.endsWith('publish_queue') && c.method === 'POST').length, 1);
  assert.equal(calls[0].body.status, 'queued'); assert.equal(calls[0].body.video_path, rows[0].video_path);
  assert.equal(new Set(rows.map(r => r.id)).size, 2);
  assert.equal(T.shouldCatchUp([{ status: 'queued' }]), 'running');
  rows = []; calls = []; run = { id: 'run1', status: 'rendering' }; mode = 'reject';
  await assert.rejects(queue, /400/); assert.equal(rows.length, 0); assert.equal(run.status, 'queued');
  rows = []; calls = []; run = { id: 'run1', status: 'rendering' }; mode = 'lost';
  await assert.rejects(queue, /connection lost/); assert.equal(rows.length, 2); assert.equal(run.status, 'queued');
  run.status = 'failed';
  const resumed = await T.createRun('u1', 'daily', '2026-11-12', null, '', true);
  assert.equal(resumed.existing, true); assert.equal(calls.filter(c => c.path.endsWith('publish_queue') && c.method === 'POST').length, 1);
  mode = 'partial_response'; rows = []; calls = [];
  await assert.rejects(queue, /تأكيد/); assert.equal(rows.length, 2);
  let attempts = 0; const result = await T.runWithRetry(async () => { attempts++; return { ok: false, stage: 'publish' }; });
  assert.equal(result.attempts, 1); assert.equal(attempts, 1);
  console.log('ALL OK: atomic batch, lost response and durable no-rerender guard (mock PostgREST)');
})().catch(e => { console.error(e); process.exitCode = 1; });

'use strict';
// Candidate orchestrator + actual publishRow with fake DB and provider only.
// NOT connected to application orchestration and no real network.
const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://storage.fixture';
const { publishBatchLimitCandidate } = require('../lib/publish_batch_limit_candidate');
let active = 0, peak = 0; const claims = new Map(), finishes = new Map(), puts = new Map(), pending = new Map(), starts = [], listeners = [];
const rows = Array.from({ length: 3 }, (_, i) => ({ id: 'job-' + i, user_id: 'owner', platform: 'youtube', connection_id: 'channel-' + i, status: 'draft', video_path: 'owner/video-' + i + '.mp4', title: 'job-' + i }));
const targets = rows.map(row => ({ platform: row.platform, connection_id: row.connection_id, row: { ...row } }));
const conn = rows.map(r => ({ id: r.connection_id, user_id: 'owner', platform: 'youtube', access_token: 'fake', expires_at: Date.now() + 3600000 }));
function stub(rel, exports) { const id = require.resolve(rel); require.cache[id] = { id, filename: id, loaded: true, exports }; }
stub('../lib/crypt', { open: x => x, seal: x => x });
stub('../lib/db', { q1: async () => null, q: async (sql, params) => {
  if (/set status='publishing'/i.test(sql)) {
    const r = rows.find(r => r.id === params[0]);
    if (!r || r.user_id !== params[1] || r.status !== params[2] || r.platform !== params[3] || r.connection_id !== params[4]) return [];
    r.status = 'publishing'; claims.set(r.id, (claims.get(r.id) || 0) + 1); active++; peak = Math.max(peak, active); return [{ ...r }];
  }
  if (/from social_connections/i.test(sql)) return conn.map(c => ({ ...c }));
  if (/set status='failed'/i.test(sql) || /set status='published'/i.test(sql)) {
    const r = rows.find(r => r.id === params[0]); assert.equal(r.status, 'publishing'); assert.equal(params[2], r.user_id);
    r.status = /set status='published'/i.test(sql) ? 'published' : 'failed';
    if (r.status === 'published') r.external_url = params[1]; else r.error = params[1];
    finishes.set(r.id, (finishes.get(r.id) || 0) + 1); active--;
    if (r.id === 'job-2') throw Error('synthetic lost final reply after commit');
    return [{ ...r }];
  }
  throw Error('unexpected mock SQL');
} });
const json = data => ({ ok: true, status: 200, json: async () => data });
global.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  if (u.origin === 'https://storage.fixture') {
    const id = 'job-' + /video-(\d+)\.mp4$/.exec(u.pathname)[1]; starts.push(id);
    for (const listener of listeners.filter(x => starts.length >= x.n)) listener.resolve();
    await new Promise(resolve => pending.set(id, resolve));
    return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1,2,3,4]).buffer };
  }
  if (u.origin === 'https://www.googleapis.com' && opts.method === 'POST') {
    const id = JSON.parse(opts.body).snippet.title;
    return { ok: true, headers: { get: () => `https://www.googleapis.com/upload/youtube/v3/videos?job=${id}` } };
  }
  if (u.origin === 'https://www.googleapis.com' && opts.method === 'PUT') {
    const id = u.searchParams.get('job'); puts.set(id, (puts.get(id) || 0) + 1);
    if (id === 'job-0') throw Error('synthetic provider reply lost after request');
    return json({ id });
  }
  throw Error('unexpected network blocked');
};
const { publishRow } = require('../lib/publish');
async function within(promise) { let timer; try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('test timeout')), 3000); })]); } finally { clearTimeout(timer); } }
const wait = n => starts.length >= n ? Promise.resolve() : within(new Promise(resolve => listeners.push({ n, resolve })));
(async () => {
  const batch = publishBatchLimitCandidate(targets, { limit: 2, publish: publishRow });
  await wait(2); assert.deepEqual(starts, ['job-0','job-1']); assert.equal(rows[2].status, 'draft', 'not yet dispatched');
  pending.get('job-0')(); await wait(3); pending.get('job-1')(); pending.get('job-2')();
  const result = await within(batch);
  assert.equal(peak, 2); assert.equal(active, 0); assert.equal(result.failed, 2); assert.deepEqual(result.urls, ['https://www.youtube.com/shorts/job-1']);
  assert.deepEqual(rows.map(r => r.status), ['failed', 'published', 'published']);
  assert.match(result.why, /ربما وصل الفيديو/);
  assert.deepEqual([...claims.values()], [1,1,1]); assert.deepEqual([...puts.values()], [1,1,1]); assert.deepEqual([...finishes.values()], [1,1,1]);
  console.log('PASS candidate bounded orchestration with actual publisher and mocked DB/provider; lost responses are not retried');
})().catch(e => { console.error(e); process.exitCode = 1; });

'use strict';
// Real publisher, DB REST translator and reclaim function with fake DB/provider.
// The second scenario deliberately demonstrates a current limitation, not a fix.
const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://db.fixture';
process.env.SUPABASE_SERVICE_KEY = 'fixture';
process.env.TOKEN_ENC_KEY = 'fixture';
const { seal } = require('../lib/crypt');
const base = { id: 'job', user_id: 'owner', platform: 'youtube', connection_id: null, status: 'scheduled', video_path: 'owner/video.mp4' };
const conn = { id: 'channel', user_id: 'owner', platform: 'youtube', access_token: seal('fake'), expires_at: Date.now() + 3600000 };
let row, uploads, releases, listeners, mutations;
const json = data => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => data, text: async () => '' });
function started(n) { if (uploads >= n) return Promise.resolve(); return new Promise(resolve => listeners.push({ n, resolve })); }
function notify() { for (const item of listeners.filter(x => uploads >= x.n)) item.resolve(); listeners = listeners.filter(x => uploads < x.n); }
global.fetch = async (url, opts = {}) => {
  const u = new URL(url), method = opts.method || 'GET';
  if (u.origin === 'https://db.fixture' && u.pathname === '/rest/v1/social_connections') return json([conn]);
  if (u.origin === 'https://db.fixture' && u.pathname === '/rest/v1/publish_queue' && method === 'PATCH') {
    const body = JSON.parse(opts.body), f = u.searchParams; mutations.push({ body, filter: f.toString() });
    if (body.status === 'publishing') {
      assert.equal(f.get('id'), 'eq.job'); assert.equal(f.get('user_id'), 'eq.owner');
      if (f.get('status') !== 'eq.' + row.status || f.get('platform') !== 'eq.' + row.platform || f.get('connection_id') !== 'is.null') return json([]);
      Object.assign(row, body); row.updated_at = new Date(Date.now() - 21 * 60000).toISOString();
      return json([{ ...row }]);
    }
    if (f.has('updated_at')) { // Actual reclaim query, in-memory time comparison.
      assert.equal(f.get('status'), 'eq.publishing');
      if (row.status !== 'publishing' || !(Date.parse(row.updated_at) < Date.parse(f.get('updated_at').slice(3)))) return json([]);
      Object.assign(row, body); return json([{ id: row.id, platform: row.platform }]);
    }
    assert.equal(f.get('id'), 'eq.job'); assert.equal(f.get('user_id'), 'eq.owner'); assert.equal(f.get('status'), 'eq.publishing');
    if (row.status !== 'publishing') return json([]);
    Object.assign(row, body); return json([{ ...row }]);
  }
  if (u.origin === 'https://db.fixture' && u.pathname.startsWith('/storage/')) return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1,2,3,4]).buffer };
  if (u.origin === 'https://www.googleapis.com' && method === 'POST') return { ok: true, headers: { get: () => 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=fixture' } };
  if (u.origin === 'https://www.googleapis.com' && method === 'PUT') {
    const index = uploads++; notify();
    return new Promise(resolve => { releases[index] = () => resolve(json({ id: index ? 'second' : 'first' })); });
  }
  throw Error('unexpected network blocked');
};
const { publishRow } = require('../lib/publish');
const { reclaimStalePublishing } = require('../lib/autopilot');
function reset() { row = { ...base }; uploads = 0; releases = []; listeners = []; mutations = []; }
(async () => {
  reset(); const first = publishRow({ ...row }); await started(1);
  assert.equal(await reclaimStalePublishing({ minutes: 20 }), 1); assert.equal(row.status, 'failed');
  assert.match(row.error, /راجع القناة/); assert.equal((await publishRow({ ...row })).skipped, 'review-required');
  releases[0](); const a = await first;
  assert.equal(a.skipped, 'result-unconfirmed'); assert.equal(row.status, 'failed'); assert.equal(uploads, 1);
  assert.equal(mutations.filter(m => m.body.status === 'published').length, 1);

  // Reproduction of ABA only: an independent legacy/external writer reactivates
  // the row while the first provider call is still in flight. This is NOT a
  // behavior of the new failed-row retry path and never touches real systems.
  reset(); const oldWorker = publishRow({ ...row }); await started(1);
  assert.equal(await reclaimStalePublishing({ minutes: 20 }), 1); assert.equal(row.status, 'failed');
  row.status = 'scheduled'; // simulate an uncoordinated legacy writer
  const newWorker = publishRow({ ...row }); await started(2); assert.equal(row.status, 'publishing');
  releases[0](); const oldResult = await oldWorker;
  assert.equal(oldResult.ok, true, 'KNOWN LIMITATION: old finalizer can match the newer publishing state');
  assert.equal(row.status, 'published'); assert.match(row.external_url, /first$/);
  releases[1](); const newResult = await newWorker;
  assert.equal(newResult.skipped, 'result-unconfirmed'); assert.equal(uploads, 2);
  console.log('PASS reclaim stops ordinary retries; KNOWN ABA LIMIT reproduced with external reactivation (mock only)');
})().catch(e => { console.error(e); process.exitCode = 1; });

'use strict';
// Publisher with in-memory database, synthetic bytes and provider stubs only.
const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://storage.fixture';
let row, platform, mode, calls;
const db = require.resolve('../lib/db');
require.cache[db] = { id: db, filename: db, loaded: true, exports: {
  q: async (sql, params) => {
    if (/set status='publishing'/i.test(sql)) { row.status = 'publishing'; return [{ ...row }]; }
    if (/from social_connections/i.test(sql)) return [{ id: 'channel', user_id: 'owner', platform, access_token: 'fake', expires_at: Date.now() + 3600000 }];
    if (/set status='failed'/i.test(sql)) { row.status = 'failed'; row.error = params[1]; return [{ ...row }]; }
    if (/set status='published'/i.test(sql)) { row.status = 'published'; row.external_url = params[1]; return [{ ...row }]; }
    throw Error('unexpected DB query');
  }, q1: async () => null,
} };
const crypt = require.resolve('../lib/crypt');
require.cache[crypt] = { id: crypt, filename: crypt, loaded: true, exports: { open: x => x, seal: x => x } };
const bytes = () => new Uint8Array([1, 2, 3, 4]).buffer;
const json = data => ({ ok: true, status: 200, json: async () => data });
global.fetch = async (url, opts = {}) => {
  const u = new URL(url); calls.push({ origin: u.origin, method: opts.method || 'GET', opts });
  if (u.origin === 'https://storage.fixture') {
    if ((opts.method || 'GET') === 'HEAD') return { ok: true, status: 200, headers: { get: () => '4' } };
    if (mode === 'network') throw Error('sensitive-fixture');
    if (mode === '404') return { ok: false, status: 404, arrayBuffer: async () => bytes() };
    if (mode === '500') return { ok: false, status: 500, arrayBuffer: async () => bytes() };
    if (mode === 'partial') return { ok: true, status: 206, arrayBuffer: async () => bytes() };
    if (mode === 'other-2xx') return { ok: true, status: 201, arrayBuffer: async () => bytes() };
    if (mode === 'empty') return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) };
    if (mode === 'wrong-body') return { ok: true, status: 200, arrayBuffer: async () => 'not bytes' };
    if (mode === 'body-error') return { ok: true, status: 200, arrayBuffer: async () => { throw Error('sensitive-fixture'); } };
    return { ok: true, status: 200, arrayBuffer: async () => bytes() };
  }
  if (u.origin === 'https://www.googleapis.com' && opts.method === 'POST') return { ok: true, headers: { get: () => 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=fixture' } };
  if (u.origin === 'https://www.googleapis.com' && opts.method === 'PUT') return json({ id: 'video_1' });
  if (u.origin === 'https://api.x.com' && u.pathname === '/2/media/upload') return json({ data: { id: 'media_1' } });
  if (u.origin === 'https://api.x.com' && u.pathname === '/2/tweets') return json({ data: { id: 'post_1' } });
  if (u.origin === 'https://open.tiktokapis.com') return json({ data: { upload_url: 'https://open-upload.tiktokapis.com/video/?upload_id=fixture', publish_id: 'fixture' } });
  if (u.origin === 'https://open-upload.tiktokapis.com') return { ok: true, status: 200 };
  throw Error('unexpected network blocked');
};
const { publishRow } = require('../lib/publish');
async function run(p, m) {
  platform = p; mode = m; calls = [];
  row = { id: 'job', user_id: 'owner', platform, connection_id: null, status: 'scheduled', video_path: 'owner/video.mp4' };
  const out = await publishRow({ ...row });
  return { out, saved: { ...row }, calls: [...calls] };
}
(async () => {
  for (const p of ['youtube', 'x', 'tiktok']) {
    for (const m of ['network', '404', '500', 'partial', 'other-2xx', 'empty', 'wrong-body', 'body-error']) {
      const result = await run(p, m);
      assert.equal(result.out.ok, false, `${p}/${m}`);
      assert.equal(result.saved.status, 'failed', `${p}/${m}`);
      assert.match(result.saved.error, /ملف الفيديو/);
      assert(!result.saved.error.includes('sensitive-fixture'));
      assert(result.calls.every(c => c.origin === 'https://storage.fixture'), `${p}/${m}: no provider upload/init`);
      const before = calls.length;
      const retry = await publishRow({ ...result.saved });
      assert.equal(retry.skipped, 'review-required'); assert.equal(calls.length, before);
    }
    const ok = await run(p, 'valid');
    assert.equal(ok.out.ok, true, p); assert.equal(ok.saved.status, 'published');
    assert(ok.calls.some(c => c.origin !== 'https://storage.fixture'));
    if (p === 'youtube') {
      const start = ok.calls.find(c => c.origin === 'https://www.googleapis.com');
      assert.equal(start.opts.headers['X-Upload-Content-Length'], '4');
      assert.equal(ok.calls.find(c => c.origin === 'https://www.googleapis.com' && c.method === 'PUT').opts.body.byteLength, 4);
    }
    if (p === 'x') {
      const upload = ok.calls.find(c => c.origin === 'https://api.x.com' && c.opts.body instanceof FormData);
      assert.deepEqual([...new Uint8Array(await upload.opts.body.get('media').arrayBuffer())], [1, 2, 3, 4]);
    }
    if (p === 'tiktok') {
      const start = ok.calls.find(c => c.origin === 'https://open.tiktokapis.com');
      assert.equal(JSON.parse(start.opts.body).post_info.privacy_level, 'SELF_ONLY_DISABLE');
      assert.equal(ok.calls.filter(c => c.origin === 'https://open.tiktokapis.com').length, 1);
      assert.deepEqual([...ok.calls.find(c => c.origin === 'https://open-upload.tiktokapis.com').opts.body], [1, 2, 3, 4]);
    }
  }
  console.log('PASS storage failure blocks provider upload/init for YouTube, X and TikTok (synthetic only)');
})().catch(e => { console.error(e); process.exitCode = 1; });

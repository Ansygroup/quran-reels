'use strict';
// Actual publisher; mocked storage, DB, and providers. All unexpected network is blocked.
const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://storage.fixture';
let row, platform, sessionUrl, mode, calls;
const db = require.resolve('../lib/db');
require.cache[db] = { id: db, filename: db, loaded: true, exports: {
  q: async (sql, params) => {
    if (/set status='publishing'/i.test(sql)) { row.status = 'publishing'; return [{ ...row }]; }
    if (/from social_connections/i.test(sql)) return [{ id: 'channel', user_id: 'owner', platform, access_token: 'fixture', expires_at: Date.now() + 3600000 }];
    if (/set status='failed'/i.test(sql)) { row.status = 'failed'; row.error = params[1]; return [{ ...row }]; }
    if (/set status='published'/i.test(sql)) { row.status = 'published'; row.external_url = params[1]; return [{ ...row }]; }
    throw Error('unexpected DB query');
  }, q1: async () => null,
} };
const crypt = require.resolve('../lib/crypt');
require.cache[crypt] = { id: crypt, filename: crypt, loaded: true, exports: { open: x => x, seal: x => x } };
const good = {
  youtube: 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=secret-fixture',
};
const json = data => ({ ok: true, status: 200, json: async () => data });
global.fetch = async (url, opts = {}) => {
  const u = new URL(url); const method = opts.method || 'GET';
  calls.push({ url: String(url), method, opts });
  if (u.origin === 'https://storage.fixture') return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer };
  if (u.origin === 'https://www.googleapis.com' && method === 'POST') return { ok: true, headers: { get: () => sessionUrl } };
  if (method === 'PUT') {
    if (mode === 'redirect') {
      if (opts.redirect !== 'error') { calls.push({ url: 'https://attacker.fixture/redirected', method: 'PUT' }); return json({ id: 'video' }); }
      throw Error('redirect to https://attacker.fixture/?secret-fixture');
    }
    if (url !== good[platform]) throw Error('unexpected PUT blocked by test');
    return json({ id: 'video_1' });
  }
  throw Error('unexpected network blocked');
};
const { publishRow } = require('../lib/publish');
async function run(p, url, m = 'normal') {
  platform = p; sessionUrl = url; mode = m; calls = [];
  row = { id: 'job', user_id: 'owner', platform, connection_id: null, status: 'scheduled', video_path: 'owner/video.mp4' };
  const out = await publishRow({ ...row });
  return { out, saved: { ...row }, calls: [...calls] };
}
(async () => {
  for (const p of ['youtube']) {
    const host = 'www.googleapis.com';
    const path = '/upload/youtube/v3/videos';
    const invalid = [null, '', 123, 'invalid', '/relative', `http://${host}${path}?secret-fixture`,
      `https://${host}.attacker.fixture${path}?secret-fixture`, `https://${host}@attacker.fixture${path}?secret-fixture`,
      `https://user:password@${host}${path}?secret-fixture`, `https://${host}:8443${path}?secret-fixture`,
      `https://${host}${path}?secret-fixture#fragment`, `https://${host}${path}?secret-fixture#`,
      `https://${host}${path}?secret-\nfixture`, ` https://${host}${path}?secret-fixture`,
      'https://127.0.0.1/private?secret-fixture', 'https://169.254.169.254/latest/meta-data?secret-fixture'];
    invalid.push('https://www.googleapis.com/other?secret-fixture');
    for (const url of invalid) {
      const r = await run(p, url);
      assert.equal(r.out.ok, false, `${p}: ${url}`); assert.equal(r.saved.status, 'failed');
      assert.match(r.out.error, /راجع المنصة/); assert(!r.saved.error.includes('secret-fixture'));
      assert(!r.calls.some(c => c.method === 'PUT'), `${p}: unsafe session URL must not receive video`);
      const count = calls.length; assert.equal((await publishRow({ ...r.saved })).skipped, 'review-required'); assert.equal(calls.length, count);
    }
    const success = await run(p, good[p]);
    assert.equal(success.out.ok, true); assert.equal(success.saved.status, 'published');
    const put = success.calls.find(c => c.method === 'PUT');
    assert.equal(put.url, good[p]); assert.equal(put.opts.redirect, 'error');
    assert.deepEqual([...put.opts.body], [1, 2, 3, 4]);
    const redir = await run(p, good[p], 'redirect');
    assert.equal(redir.out.ok, false); assert.equal(redir.saved.status, 'failed');
    assert(!redir.calls.some(c => c.url.startsWith('https://attacker.fixture')));
    assert.match(redir.out.error, /راجع المنصة/); assert(!redir.saved.error.includes('secret-fixture'));
  }
  console.log('PASS unsafe upload session URLs and redirects blocked for YouTube (mock only)');
})().catch(e => { console.error(e); process.exitCode = 1; });

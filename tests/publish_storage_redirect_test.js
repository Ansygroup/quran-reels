'use strict';
// Actual Node fetch against two loopback-only disposable HTTP servers; provider
// and DB are synthetic. The redirect target is also loopback, never external.
const assert = require('node:assert/strict'), http = require('node:http');
let row, platform, redirects = 0, sameRedirects = 0, sameOriginTarget = false, providerCalls = 0, mode = 302, storageOrigin, targetOrigin;
function stub(rel, exports) { const id = require.resolve(rel); require.cache[id] = { id, filename: id, loaded: true, exports }; }
stub('../lib/crypt', { open: x => x, seal: x => x });
stub('../lib/db', {
  q: async (sql, params) => {
    if (/set status='publishing'/i.test(sql)) { row.status = 'publishing'; return [{ ...row }]; }
    if (/from social_connections/i.test(sql)) return [{ id: 'channel', user_id: 'owner', platform, access_token: 'fixture', expires_at: Date.now() + 3600000 }];
    if (/set status='failed'/i.test(sql)) { row.status = 'failed'; row.error = params[1]; return [{ ...row }]; }
    if (/set status='published'/i.test(sql)) { row.status = 'published'; row.external_url = params[1]; return [{ ...row }]; }
    throw Error('unexpected DB query');
  }, q1: async () => null,
});
const target = http.createServer((_req, res) => { redirects++; res.writeHead(200, { 'content-type': 'video/mp4' }).end(Buffer.from([1,2,3,4])); });
const storage = http.createServer((req, res) => {
  if (req.url.startsWith('/redirected')) { sameRedirects++; return res.writeHead(200).end(Buffer.from([1,2,3,4])); }
  if (mode === 'valid') return res.writeHead(200, { 'content-type': 'video/mp4' }).end(Buffer.from([1,2,3,4]));
  res.writeHead(mode, { location: (sameOriginTarget ? storageOrigin : targetOrigin) + '/redirected?fixture=secret' }).end();
});
const realFetch = global.fetch;
const json = data => ({ ok: true, status: 200, json: async () => data });
global.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  if (u.origin === storageOrigin || u.origin === targetOrigin) return realFetch(url, opts);
  // Fully mocked success responses. No request is made to any provider host.
  providerCalls++;
  if (u.origin === 'https://www.googleapis.com' && opts.method === 'POST') return { ok: true, headers: { get: () => 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=fixture' } };
  if (u.origin === 'https://www.googleapis.com' && opts.method === 'PUT') return json({ id: 'video' });
  if (u.origin === 'https://api.x.com' && u.pathname === '/2/media/upload') return json({ data: { id: 'media' } });
  if (u.origin === 'https://api.x.com' && u.pathname === '/2/tweets') return json({ data: { id: 'post' } });
  if (u.origin === 'https://open.tiktokapis.com') return json({ data: { upload_url: 'https://open-upload.tiktokapis.com/upload?fixture=1', publish_id: 'id' }, error: { code: 'ok' } });
  if (u.origin === 'https://open-upload.tiktokapis.com' && opts.method === 'PUT') return { ok: true, status: 200 };
  throw Error('unexpected external request blocked');
};
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve('http://127.0.0.1:' + server.address().port)));
const close = server => new Promise(resolve => server.close(resolve));
(async () => { try {
  targetOrigin = await listen(target); storageOrigin = await listen(storage); process.env.SUPABASE_URL = storageOrigin;
  const { publishRow } = require('../lib/publish');
  for (const p of ['youtube', 'x', 'tiktok']) {
    for (const code of [301, 302, 303, 307, 308]) for (const same of [false, true]) {
      platform = p; mode = code; sameOriginTarget = same; redirects = 0; sameRedirects = 0; providerCalls = 0;
      row = { id: 'job', user_id: 'owner', platform, connection_id: null, status: 'scheduled', video_path: 'owner/video.mp4' };
      const out = await publishRow({ ...row });
      assert.equal(out.ok, false, `${p}/${code}/${same}`); assert.equal(row.status, 'failed');
      assert.match(row.error, /ملف الفيديو/); assert(!row.error.includes('fixture=secret'));
      assert.equal(redirects, 0, 'must not follow cross-origin redirect');
      assert.equal(sameRedirects, 0, 'must not follow same-origin redirect'); assert.equal(providerCalls, 0, 'no provider init/upload');
      assert.equal((await publishRow({ ...row })).skipped, 'review-required');
    }
    platform = p; mode = 'valid'; redirects = 0; providerCalls = 0;
    row = { id: 'job', user_id: 'owner', platform, connection_id: null, status: 'scheduled', video_path: 'owner/video.mp4' };
    assert.equal((await publishRow({ ...row })).ok, true); assert.equal(row.status, 'published'); assert(providerCalls > 0);
  }
  console.log('PASS storage redirects blocked for YouTube, X and TikTok with real loopback fetch; providers mocked');
} finally {
  global.fetch = realFetch;
  if (storage.listening) await close(storage);
  if (target.listening) await close(target);
} })().catch(e => { console.error(e); process.exitCode = 1; });

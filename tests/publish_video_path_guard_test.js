'use strict';
// Real manual handler + publishRow with fake DB and blocked provider network.
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
process.env.SUPABASE_URL = 'https://storage.fixture';
let row, writes, requests, status;
function stub(rel, exports) { const id = require.resolve(rel); require.cache[id] = { id, filename: id, loaded: true, exports }; }
stub('../lib/sess', { getUserId: async () => 'owner' });
stub('../lib/crypt', { open: x => x, seal: x => x });
stub('../lib/db', {
  q1: async () => { throw Error('unexpected lookup'); },
  rest: async (_path, opts) => { const item = JSON.parse(opts.body); writes.push(item); return [{ ...item }]; },
  q: async (sql, args) => {
    if (/set status='publishing'/i.test(sql)) { status = row.status = 'publishing'; return [{ ...row }]; }
    if (/from social_connections/i.test(sql)) return [{ id: 'channel', user_id: 'owner', platform: row.platform, access_token: 'fake', expires_at: Date.now() + 3600000 }];
    if (/set status='failed'/i.test(sql)) { status = row.status = 'failed'; row.error = args[1]; return [{ ...row }]; }
    if (/set status='published'/i.test(sql)) { status = row.status = 'published'; row.external_url = args[1]; return [{ ...row }]; }
    throw Error('unexpected query');
  },
});
global.fetch = async (url, opts = {}) => {
  const u = new URL(url); requests.push({ url: String(url), method: opts.method || 'GET' });
  if (u.origin === 'https://storage.fixture') return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1,2,3,4]).buffer };
  if (u.origin === 'https://www.googleapis.com' && opts.method === 'POST') return { ok: true, headers: { get: () => 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=fixture' } };
  if (u.origin === 'https://www.googleapis.com' && opts.method === 'PUT') return { ok: true, status: 200, json: async () => ({ id: 'video_1' }) };
  throw Error('external network blocked');
};
const { publishRow, videoUrl } = require('../lib/publish');
const endpoint = require('../api/_publish');
async function manual(path) {
  writes = []; requests = [];
  const req = Readable.from([JSON.stringify({ platform: 'youtube', video_path: path, publish_at: new Date(Date.now() + 86400000).toISOString() })]);
  req.method = 'POST'; req.headers = {};
  const res = { setHeader() {}, end(data) { this.body = JSON.parse(data); } };
  await endpoint(req, res); return res;
}
async function dispatch(path, platform = 'youtube') {
  requests = []; status = 'scheduled';
  row = { id: 'job', user_id: 'owner', platform, status, connection_id: null, video_path: path };
  const out = await publishRow({ ...row }); return { out, saved: { ...row }, requests: [...requests] };
}
(async () => {
  const bad = [null, '', '/', 'owner//file.mp4', 'owner/./file.mp4', 'owner/../file.mp4', 'owner/%2e%2e/file.mp4',
    'owner/file%2fsecret.mp4', 'owner\\file.mp4', 'owner/file\n.mp4', 'owner/file\0.mp4', 'owner/\ud800.mp4'];
  for (const p of bad) {
    const r = await manual(p); assert.equal(r.statusCode, 400, JSON.stringify(p)); assert.equal(writes.length, 0); assert.equal(requests.length, 0);
    for (const platform of ['youtube', 'facebook', 'instagram', 'tiktok', 'x']) {
      const result = await dispatch(p, platform); assert.equal(result.out.ok, false, platform); assert.equal(result.saved.status, 'failed');
      assert.equal(result.requests.length, 0, 'bad historical path must not contact storage or provider');
      assert.equal((await publishRow({ ...result.saved })).skipped, 'review-required'); assert.equal(requests.length, 0);
    }
  }
  const p = 'owner/مقطع جميل?#.mp4';
  assert.equal(videoUrl(p), 'https://storage.fixture/storage/v1/object/public/reels/owner/%D9%85%D9%82%D8%B7%D8%B9%20%D8%AC%D9%85%D9%8A%D9%84%3F%23.mp4');
  let r = await manual('/' + p); assert.equal(r.statusCode, 200); assert.equal(writes.length, 1); assert.equal(writes[0].video_path, p); assert.equal(requests.length, 0);
  const result = await dispatch(p); assert.equal(result.out.ok, true); assert.equal(result.saved.status, 'published');
  assert.equal(result.requests[0].url, videoUrl(p)); assert.equal(result.requests.length, 3);
  console.log('PASS malformed video paths stop before insert/dispatch and literal filenames are encoded (mock only)');
})().catch(e => { console.error(e); process.exitCode = 1; });

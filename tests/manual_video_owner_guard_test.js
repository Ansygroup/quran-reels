'use strict';
// Manual endpoint, synthetic identities, DB and publisher. No actual network.
const assert = require('node:assert/strict'), { Readable } = require('node:stream');
let uid = 'owner', inserts = [], dispatched = [], lookups = 0;
function stub(rel, exports) { const id = require.resolve(rel); require.cache[id] = { id, filename: id, loaded: true, exports }; }
stub('../lib/sess', { getUserId: async () => uid });
stub('../lib/db', {
  q1: async (_sql, params) => { lookups++; return { id: params[0], user_id: uid, platform: 'youtube', status: 'draft', connection_id: null, video_path: 'other/legacy.mp4' }; },
  rest: async (_path, opts) => { const value = JSON.parse(opts.body); inserts.push(value); return [{ ...value }]; },
});
stub('../lib/publish', { publishRow: async row => { dispatched.push(row); return { ok: true, url: 'https://fixture.invalid/video' }; } });
global.fetch = async () => { throw Error('external network blocked'); };
const endpoint = require('../api/_publish');
async function call(body) {
  const req = Readable.from([JSON.stringify(body)]); req.method = 'POST'; req.headers = {};
  const res = { setHeader() {}, end(data) { this.body = JSON.parse(data); } };
  await endpoint(req, res); return res;
}
function reset() { inserts = []; dispatched = []; lookups = 0; }
(async () => {
  // Same prefix text is insufficient: a complete first segment must match.
  for (const path of ['other/video.mp4', 'owner2/video.mp4', 'Owner/video.mp4', 'owner', 'shared/video.mp4',
    'owner//v.mp4', 'owner/../other/v.mp4', 'owner%2fother/v.mp4']) {
    for (const now of [true, false]) {
      reset(); const res = await call({ platform: 'youtube', video_path: path, now, publish_at: new Date(Date.now() + 86400000).toISOString() });
      assert.equal(res.statusCode, 400, `${path} ${now}`);
      assert.equal(inserts.length, 0); assert.equal(dispatched.length, 0); assert.equal(lookups, 0);
    }
  }
  for (const path of ['/owner/مقطع جميل?#.mp4', 'owner/autopilot/2026-11-07-fixture.mp4']) {
    reset(); const res = await call({ platform: 'youtube', video_path: path, now: true });
    assert.equal(res.statusCode, 200); assert.equal(inserts.length, 1); assert.equal(inserts[0].video_path, path.replace(/^\/+/, '')); assert.equal(dispatched.length, 1);
  }
  uid = 'second'; reset(); assert.equal((await call({ platform: 'youtube', video_path: 'owner/v.mp4', now: true })).statusCode, 400);
  assert.equal(inserts.length, 0); assert.equal(dispatched.length, 0);
  reset(); assert.equal((await call({ platform: 'youtube', video_path: 'second/v.mp4', now: false, publish_at: new Date(Date.now() + 86400000).toISOString() })).statusCode, 200);
  assert.equal(inserts[0].status, 'scheduled'); assert.equal(dispatched.length, 0);
  // The endpoint delegates queue_id rows to its publisher. This test uses a
  // stub; the real publisher's separate claimed-row guard is tested elsewhere.
  uid = 'owner'; reset(); assert.equal((await call({ queue_id: 'old-row' })).statusCode, 200);
  assert.equal(dispatched[0].video_path, 'other/legacy.mp4'); assert.equal(inserts.length, 0);
  console.log('PASS new manual paths use exact owner prefix; queue_id delegates to mocked publisher');
})().catch(e => { console.error(e); process.exitCode = 1; });

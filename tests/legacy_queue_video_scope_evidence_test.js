'use strict';
// Demonstrates current limitation with synthetic rows, fake DB and blocked
// network. No production, storage service or provider is contacted.
const assert = require('node:assert/strict'), { Readable } = require('node:stream');
process.env.SUPABASE_URL = 'https://storage.fixture'; process.env.CRON_SECRET = 'fixture';
let row, calls, dbWrites;
function stub(rel, exports) { const id = require.resolve(rel); require.cache[id] = { id, filename: id, loaded: true, exports }; }
stub('../lib/crypt', { open: x => x, seal: x => x });
stub('../lib/sess', { getUserId: async () => 'owner' });
stub('../lib/autopilot', { reclaimStalePublishing: async () => 0, runDailyAutopilots: async () => [] });
stub('../lib/db', {
  q1: async (_sql, args) => args[0] === row.id && args[1] === row.user_id ? { ...row } : null,
  q: async (sql, args) => {
    if (/from publish_queue/i.test(sql) && /^\s*select/i.test(sql)) return row.status === 'scheduled' ? [{ ...row }] : [];
    if (/set status='publishing'/i.test(sql)) { assert.equal(row.status, args[2]); row.status = 'publishing'; dbWrites.push('claim'); return [{ ...row }]; }
    if (/from social_connections/i.test(sql)) return [{ id: 'channel', user_id: 'owner', platform: row.platform, access_token: 'fake', expires_at: Date.now() + 3600000, meta: JSON.stringify({ ig_id: 'ig', pages: [{ id: 'page', access_token: 'fake' }] }) }];
    if (/set status='failed'/i.test(sql)) { row.status = 'failed'; row.error = args[1]; dbWrites.push('failed'); return [{ ...row }]; }
    throw Error('unexpected SQL in mock');
  },
});
global.fetch = async (url, opts = {}) => { calls.push({ url: new URL(url), method: opts.method || 'GET' }); throw Error('synthetic request blocked'); };
const endpoint = require('../api/_publish'), cron = require('../api/cron/publish');
async function manual() {
  const req = Readable.from([JSON.stringify({ queue_id: 'legacy' })]); req.method = 'POST'; req.headers = {};
  const res = { setHeader() {}, end(data) { this.body = JSON.parse(data); } }; await endpoint(req, res); return res;
}
async function scheduled() {
  const res = { setHeader() {}, end(data) { this.body = JSON.parse(data); } };
  await cron({ headers: { authorization: 'Bearer fixture' } }, res); return res;
}
(async () => {
  for (const platform of ['youtube', 'facebook', 'instagram', 'tiktok', 'x']) {
    for (const entry of ['manual', 'cron']) {
      row = { id: 'legacy', user_id: 'owner', platform, connection_id: null, status: 'scheduled', video_path: 'other/video.mp4' };
      calls = []; dbWrites = [];
      await (entry === 'manual' ? manual() : scheduled());
      assert.equal(calls.length, 1, `${entry}/${platform}: a request was attempted`);
      if (platform === 'facebook') assert.equal(calls[0].url.searchParams.get('source'), 'https://storage.fixture/storage/v1/object/public/reels/other/video.mp4');
      else if (platform === 'instagram') assert.equal(calls[0].url.searchParams.get('video_url'), 'https://storage.fixture/storage/v1/object/public/reels/other/video.mp4');
      else assert.equal(calls[0].url.href, 'https://storage.fixture/storage/v1/object/public/reels/other/video.mp4');
      assert.equal(row.status, 'failed'); assert.deepEqual(dbWrites, ['claim', 'failed']);
    }
  }
  console.log('PASS known limitation reproduced: existing cross-prefix rows reach mocked network through manual/cron on five platforms');
})().catch(e => { console.error(e); process.exitCode = 1; });

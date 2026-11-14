'use strict';
// Actual manual/cron/publisher with synthetic rows, fake DB and blocked network.
const assert = require('node:assert/strict'), { Readable } = require('node:stream');
process.env.SUPABASE_URL = 'https://storage.fixture'; process.env.CRON_SECRET = 'fixture';
let row, calls, dbWrites, connectionReads, claimChangesPath, loseFinalReply;
function stub(rel, exports) { const id = require.resolve(rel); require.cache[id] = { id, filename: id, loaded: true, exports }; }
stub('../lib/crypt', { open: x => x, seal: x => x });
stub('../lib/sess', { getUserId: async () => 'owner' });
stub('../lib/autopilot', { reclaimStalePublishing: async () => 0, runDailyAutopilots: async () => [] });
stub('../lib/db', {
  q1: async (_sql, args) => args[0] === row.id && args[1] === row.user_id ? { ...row } : null,
  q: async (sql, args) => {
    if (/from publish_queue/i.test(sql) && /^\s*select/i.test(sql)) return row.status === 'scheduled' ? [{ ...row }] : [];
    if (/set status='publishing'/i.test(sql)) {
      assert.equal(row.status, args[2]); if (claimChangesPath) row.video_path = claimChangesPath;
      row.status = 'publishing'; dbWrites.push('claim'); return [{ ...row }];
    }
    if (/from social_connections/i.test(sql)) {
      connectionReads++; return [{ id: 'channel', user_id: 'owner', platform: row.platform, access_token: 'fake', expires_at: Date.now() + 3600000, meta: JSON.stringify({ ig_id: 'ig', pages: [{ id: 'page', access_token: 'fake' }] }) }];
    }
    if (/set status='failed'/i.test(sql)) {
      row.status = 'failed'; row.error = args[1]; dbWrites.push('failed');
      if (loseFinalReply) throw Error('synthetic reply lost after commit');
      return [{ ...row }];
    }
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
function reset(platform, path, options = {}) {
  row = { id: 'legacy', user_id: 'owner', platform, connection_id: null, status: 'scheduled', video_path: path };
  calls = []; dbWrites = []; connectionReads = 0; claimChangesPath = options.claimChangesPath; loseFinalReply = options.loseFinalReply;
}
(async () => {
  for (const platform of ['youtube', 'x']) {
    for (const entry of ['manual', 'cron']) {
      for (const path of ['other/video.mp4', 'owner2/video.mp4', 'shared/video.mp4', 'owner', 'owner/../other/video.mp4']) {
        reset(platform, path); const result = await (entry === 'manual' ? manual() : scheduled());
        assert.equal(calls.length, 0, `${entry}/${platform}/${path}: no storage/provider request`);
        assert.equal(connectionReads, 0, 'do not even look up or refresh credentials');
        assert.equal(row.status, 'failed'); assert.match(row.error, /راجع/);
        assert.deepEqual(dbWrites, ['claim', 'failed']);
        if (entry === 'manual') { assert.equal(result.statusCode, 502); assert.equal(result.body.ok, false); }
        else { assert.equal(result.body.ran, 1); assert.equal(result.body.fail, 1); }
      }
      // Path mutates after the initial read but before claim: validate the
      // returned claim row rather than trusting the old snapshot.
      reset(platform, 'owner/video.mp4', { claimChangesPath: 'other/video.mp4' });
      await (entry === 'manual' ? manual() : scheduled());
      assert.equal(calls.length, 0); assert.equal(connectionReads, 0); assert.equal(row.status, 'failed');
      // Correct owner prefix retains the existing dispatch behavior, with all
      // external requests blocked; this does not prove storage ownership.
      reset(platform, 'owner/مقطع.mp4'); await (entry === 'manual' ? manual() : scheduled());
      assert.equal(connectionReads, 1); assert.equal(calls.length, 1); assert.equal(row.status, 'failed');
    }
  }
  reset('youtube', 'other/video.mp4', { loseFinalReply: true });
  const lost = await manual(); assert.equal(lost.body.skipped, 'result-unconfirmed');
  assert.equal(calls.length, 0); assert.equal(connectionReads, 0); assert.deepEqual(dbWrites, ['claim', 'failed']);
  console.log('PASS claimed legacy paths outside owner prefix fail for review before any network (mock only)');
})().catch(e => { console.error(e); process.exitCode = 1; });

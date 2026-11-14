'use strict';
/* Actual publishRow with synthetic DB replies; no provider or production traffic. */
const assert = require('node:assert/strict');
process.env.TOKEN_ENC_KEY = 'fixture-only';
const { seal } = require('../lib/crypt');
const db = require.resolve('../lib/db');
const base = { id: 'job', user_id: 'owner', platform: 'youtube', connection_id: null, status: 'scheduled', video_path: 'owner/video.mp4' };
const valid = { id: 'channel', user_id: 'owner', platform: 'youtube', is_default: true, access_token: seal('fixture-token'), expires_at: Date.now() + 3600000 };
let connections, claims, finals, reads, fetches;
require.cache[db] = { id: db, filename: db, loaded: true, exports: {
  q: async (sql, params) => {
    if (/set status='publishing'/i.test(sql)) { claims++; return [{ ...base, connection_id: params[4] || null, status: 'publishing' }]; }
    if (/from social_connections/i.test(sql)) { reads++; assert.deepEqual(params, ['owner', 'youtube']); return connections; }
    if (/set status='failed'/i.test(sql)) { finals++; return [{ id: 'job', user_id: 'owner', status: 'failed' }]; }
    throw Error('unexpected query');
  }, q1: async () => null,
} };
global.fetch = async () => { fetches++; throw Error('provider must not be contacted'); };
const { publishRow } = require('../lib/publish');
(async () => {
  const malformed = [
    [{ ...valid, user_id: 'other-owner' }], [{ ...valid, platform: 'facebook' }],
    [{ ...valid, id: '' }], [{ ...valid, user_id: undefined }], [{ ...valid, platform: undefined }],
    [null], {}, [valid, { ...valid, id: 'other', user_id: 'other-owner' }], [valid, { ...valid }],
  ];
  for (const list of malformed) {
    for (const connection_id of [null, 'channel']) {
      connections = list; claims = finals = reads = fetches = 0;
      const result = await publishRow({ ...base, connection_id });
      assert.equal(result.ok, false); assert.match(result.error, /تعذّر التحقق من القنوات/);
      assert.equal(claims, 1); assert.equal(reads, 1); assert.equal(finals, 1); assert.equal(fetches, 0);
    }
  }
  connections = []; claims = finals = reads = fetches = 0;
  const empty = await publishRow({ ...base });
  assert.match(empty.error, /لا يوجد ربط/); assert.equal(fetches, 0);
  console.log('PASS malformed or foreign connection results stop before any provider request (synthetic only)');
})().catch(e => { console.error(e); process.exitCode = 1; });

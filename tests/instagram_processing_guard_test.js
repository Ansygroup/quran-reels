'use strict';
// Actual publishRow with an in-memory DB and fully blocked/mock network.
const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://storage.fixture';
let row, replies, requests, polls;
const db = require.resolve('../lib/db');
require.cache[db] = { id: db, filename: db, loaded: true, exports: {
  q: async (sql, params) => {
    if (/set status='publishing'/i.test(sql)) { row.status = 'publishing'; return [{ ...row }]; }
    if (/from social_connections/i.test(sql)) return [{ id: 'channel', user_id: 'owner', platform: 'instagram', access_token: 'fake', expires_at: Date.now() + 3600000, meta: JSON.stringify({ ig_id: 'ig' }) }];
    if (/set status='failed'/i.test(sql)) { row.status = 'failed'; row.error = params[1]; return [{ ...row }]; }
    if (/set status='published'/i.test(sql)) { row.status = 'published'; row.external_url = params[1]; return [{ ...row }]; }
    throw Error('unexpected database query');
  }, q1: async () => null,
} };
const crypt = require.resolve('../lib/crypt');
require.cache[crypt] = { id: crypt, filename: crypt, loaded: true, exports: { open: x => x, seal: x => x } };
const response = (data, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => data });
global.fetch = async url => {
  const u = new URL(url); requests.push(u.pathname);
  if (u.origin !== 'https://graph.facebook.com') throw Error('unexpected network blocked');
  if (u.pathname === '/v21.0/ig/media') return response({ id: 'container_1' });
  if (u.pathname === '/v21.0/container_1') {
    const r = replies[Math.min(polls++, replies.length - 1)];
    if (r instanceof Error) throw r;
    return r;
  }
  if (u.pathname === '/v21.0/ig/media_publish') return response({ id: 'published_1' });
  throw Error('unexpected network blocked');
};
const { publishRow } = require('../lib/publish');
const originalTimeout = global.setTimeout;
global.setTimeout = fn => { fn(); return 0; }; // Eliminate polling delays in this isolated test.
async function run(input) {
  replies = input; requests = []; polls = 0;
  row = { id: 'job', user_id: 'owner', platform: 'instagram', connection_id: null, status: 'scheduled', video_path: 'fixture.mp4' };
  const out = await publishRow({ ...row });
  return { out, saved: { ...row }, paths: [...requests], polls };
}
(async () => {
  const invalid = [
    response({ status_code: 'FINISHED' }, false),
    response({ status_code: 'FINISHED', error: { message: 'fixture' } }),
    response({ status_code: 'FINISHED', errors: [{ message: 'fixture' }] }),
    response(null), response([]), response({}), response({ status_code: 1 }),
    response({ status_code: 'PUBLISHED' }), response({ status_code: 'UNKNOWN' }),
    { ok: true, status: 200, json: async () => { throw Error('bad JSON'); } },
    new Error('network lost'),
    response({ status_code: 'ERROR' }), response({ status_code: 'EXPIRED' }),
  ];
  for (const reply of invalid) {
    const result = await run([reply]);
    assert.equal(result.out.ok, false);
    assert.equal(result.saved.status, 'failed');
    assert.match(result.saved.error, /راجع المنصة/);
    assert(!result.paths.includes('/v21.0/ig/media_publish'), 'ambiguous processing response must not publish');
    const before = requests.length;
    const retry = await publishRow({ ...result.saved });
    assert.equal(retry.skipped, 'review-required');
    assert.equal(requests.length, before, 'failed job must not be dispatched again');
  }
  for (const last of [response({ status_code: 'FINISHED' }, false), response(null), new Error('connection lost')]) {
    const result = await run([response({ status_code: 'IN_PROGRESS' }), last]);
    assert.equal(result.out.ok, false); assert.equal(result.saved.status, 'failed');
    assert.equal(result.polls, 2); assert.match(result.saved.error, /راجع المنصة/);
    assert(!result.paths.includes('/v21.0/ig/media_publish'));
  }
  let result = await run([response({ status_code: 'IN_PROGRESS' })]);
  assert.equal(result.out.ok, false); assert.equal(result.saved.status, 'failed');
  assert.match(result.saved.error, /راجع المنصة/);
  assert.equal(result.polls, 8); assert(!result.paths.includes('/v21.0/ig/media_publish'));
  result = await run([response({ status_code: 'IN_PROGRESS' }), response({ status_code: 'FINISHED' })]);
  assert.equal(result.out.ok, true); assert.equal(result.saved.status, 'published');
  assert.equal(result.polls, 2); assert.equal(result.paths.filter(p => p === '/v21.0/ig/media_publish').length, 1);
  result = await run([response({ status_code: 'FINISHED', error: null, errors: [] })]);
  assert.equal(result.out.ok, true); assert.equal(result.polls, 1);
  console.log('PASS Instagram processing response guard with mocked DB and provider; no real network');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { global.setTimeout = originalTimeout; });

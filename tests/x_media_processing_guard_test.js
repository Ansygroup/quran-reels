'use strict';
// Publisher with synthetic database, storage and X responses; no external network.
const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://storage.fixture';
let row, initial, replies, calls, waits;
const db = require.resolve('../lib/db');
require.cache[db] = { id: db, filename: db, loaded: true, exports: {
  q: async (sql, params) => {
    if (/set status='publishing'/i.test(sql)) { row.status = 'publishing'; return [{ ...row }]; }
    if (/from social_connections/i.test(sql)) return [{ id: 'channel', user_id: 'owner', platform: 'x', access_token: 'fake', expires_at: Date.now() + 3600000 }];
    if (/set status='failed'/i.test(sql)) { row.status = 'failed'; row.error = params[1]; return [{ ...row }]; }
    if (/set status='published'/i.test(sql)) { row.status = 'published'; row.external_url = params[1]; return [{ ...row }]; }
    throw Error('unexpected database query');
  }, q1: async () => null,
} };
const crypt = require.resolve('../lib/crypt');
require.cache[crypt] = { id: crypt, filename: crypt, loaded: true, exports: { open: x => x, seal: x => x } };
const response = (data, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => data });
const media = info => ({ data: { id: 'media_1', ...(info === undefined ? {} : { processing_info: info }) } });
const info = (state, delay = 1) => ({ state, check_after_secs: delay });
global.fetch = async (url, opts = {}) => {
  const u = new URL(url), method = opts.method || 'GET'; calls.push({ url: u, method, opts });
  if (u.origin === 'https://storage.fixture') return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer };
  if (u.origin === 'https://api.x.com' && u.pathname === '/2/media/upload' && method === 'POST') return response(initial);
  if (u.origin === 'https://api.x.com' && u.pathname === '/2/media/upload' && method === 'GET') {
    assert.equal(u.searchParams.get('command'), 'STATUS'); assert.equal(u.searchParams.get('media_id'), 'media_1');
    assert.equal(opts.headers.Authorization, 'Bearer fake'); assert(opts.signal instanceof AbortSignal);
    const r = replies.shift(); if (r instanceof Error) throw r;
    if (!r) throw Error('unexpected poll'); return r;
  }
  if (u.origin === 'https://api.x.com' && u.pathname === '/2/tweets' && method === 'POST') return response({ data: { id: 'post_1' } });
  throw Error('unexpected network blocked');
};
const { publishRow } = require('../lib/publish');
const oldTimeout = global.setTimeout;
global.setTimeout = (fn, ms) => { waits.push(ms); fn(); return 0; };
async function run(start, statuses = []) {
  initial = start; replies = [...statuses]; calls = []; waits = [];
  row = { id: 'job', user_id: 'owner', platform: 'x', connection_id: null, status: 'scheduled', video_path: 'owner/video.mp4' };
  const out = await publishRow({ ...row }); return { out, saved: { ...row }, calls: [...calls], waits: [...waits] };
}
const count = (r, method, path) => r.calls.filter(c => c.method === method && c.url.pathname === path).length;
(async () => {
  const failures = [
    [media(info('failed')), []], [media(info('unknown')), []], [media(null), []],
    [{ data: { id: 'media_1', processing_info: undefined } }, []],
    [{ id: 'different', data: { id: 'media_1', processing_info: info('succeeded') } }, []],
    [{ id: 'media_1', processing_info: info('succeeded'), data: { id: 'media_1', processing_info: info('succeeded') } }, []],
    [media({}), []], [media('succeeded'), []], [media({ state: 'succeeded', error: { message: 'sensitive-fixture' } }), []],
    [media({ state: 'succeeded', errors: [{ message: 'sensitive-fixture' }] }), []], [media(info('pending', -1)), []],
    [media(info('pending', '1')), []], [media(info('pending', 6)), []],
    [media(info('pending')), [new Error('sensitive-fixture')]],
    [media(info('pending')), [response(media(info('succeeded')), false)]],
    [media(info('pending')), [response({ data: { id: 'other', processing_info: info('succeeded') } })]],
    [media(info('pending')), [response({ data: { processing_info: info('succeeded') } })]],
    [media(info('pending')), [response({ data: { id: 'media_1' } })]],
    [media(info('pending')), [{ ok: true, json: async () => { throw Error('sensitive-fixture'); } }]],
    [media(info('pending')), [response({ data: { id: 'media_1', processing_info: info('succeeded') }, errors: [{ detail: 'sensitive-fixture' }] })]],
    [media(info('pending')), [response(media(info('failed')))]],
    [media(info('pending')), [response(media(info('pending'))), response(media(info('pending'))), response(media(info('pending'))), response(media(info('pending')))]]
  ];
  for (const [start, statuses] of failures) {
    const r = await run(start, statuses);
    assert.equal(r.out.ok, false); assert.equal(r.saved.status, 'failed');
    assert.match(r.saved.error, /راجع المنصة/); assert(!r.saved.error.includes('sensitive-fixture'));
    assert.equal(count(r, 'POST', '/2/media/upload'), 1); assert.equal(count(r, 'POST', '/2/tweets'), 0);
    assert(count(r, 'GET', '/2/media/upload') <= 4); assert(r.waits.every(ms => ms >= 0 && ms <= 5000));
    const before = calls.length; assert.equal((await publishRow({ ...r.saved })).skipped, 'review-required'); assert.equal(calls.length, before);
  }
  let r = await run(media(undefined)); assert.equal(r.out.ok, true); assert.equal(count(r, 'GET', '/2/media/upload'), 0); assert.equal(count(r, 'POST', '/2/tweets'), 1);
  r = await run(media(info('succeeded'))); assert.equal(r.out.ok, true); assert.equal(count(r, 'POST', '/2/tweets'), 1);
  r = await run(media(info('pending', 1)), [response(media(info('in_progress', 2))), response(media(info('succeeded')))]);
  assert.equal(r.out.ok, true); assert.deepEqual(r.waits, [1000, 2000]); assert.equal(count(r, 'GET', '/2/media/upload'), 2); assert.equal(count(r, 'POST', '/2/tweets'), 1);
  assert(r.calls.findIndex(c => c.url.pathname === '/2/tweets') > r.calls.map(c => c.method).lastIndexOf('GET'));
  assert.equal(count(r, 'POST', '/2/media/upload'), 1);
  r = await run({ id: 'media_1', processing_info: info('pending') }, [response({ id: 'media_1', processing_info: info('succeeded') })]);
  assert.equal(r.out.ok, true); assert.equal(count(r, 'GET', '/2/media/upload'), 1);
  console.log('PASS X processing state guards and bounded status polling (mock only)');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { global.setTimeout = oldTimeout; });

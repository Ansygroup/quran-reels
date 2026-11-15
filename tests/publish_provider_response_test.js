'use strict';
/* Real publisher with synthetic DB and providers. No real network or video. */
const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://storage.fixture';
let platform, badStage, value, row, requests;
const db = require.resolve('../lib/db');
require.cache[db] = { id: db, filename: db, loaded: true, exports: {
  q: async (sql, params) => {
    if (/set status='publishing'/i.test(sql)) { row.status = 'publishing'; return [{ ...row }]; }
    if (/from social_connections/i.test(sql)) return [{ id: 'channel', user_id: 'owner', platform, access_token: 'access', meta: JSON.stringify({ pages: [{ id: 'page', access_token: 'page-token' }], ig_id: 'instagram' }), expires_at: Date.now() + 3600000 }];
    if (/set status='failed'/i.test(sql)) { row.status = 'failed'; row.error = params[1]; return [{ ...row }]; }
    if (/set status='published'/i.test(sql)) { row.status = 'published'; row.external_url = params[1]; return [{ ...row }]; }
    throw Error('unexpected DB query');
  }, q1: async () => null,
} };
const crypt = require.resolve('../lib/crypt');
require.cache[crypt] = { id: crypt, filename: crypt, loaded: true, exports: { open: x => x, seal: x => x } };
const json = data => ({ ok: true, status: 200, json: async () => data });
const NULL_BODY = Symbol('null body');
const ERROR_BODY = Symbol('contradictory error');
const ERRORS_BODY = Symbol('contradictory errors');
const EMPTY_ERRORS = Symbol('empty errors');
const X_TOP = Symbol('top-level media id');
const X_TOP_ERROR = Symbol('top-level media id with error');
const validIdCases = [ERROR_BODY, ERRORS_BODY, EMPTY_ERRORS, X_TOP, X_TOP_ERROR];
const id = stage => stage === badStage && !validIdCases.includes(value) ? value : 'valid_123';
const reply = (stage, data) => {
  if (stage !== badStage) return json(data);
  if (value === NULL_BODY) return json(null);
  if (value === ERROR_BODY) return json({ ...data, error: { message: 'sensitive-fixture' } });
  if (value === ERRORS_BODY) return json({ ...data, errors: [{ message: 'sensitive-fixture' }] });
  if (value === EMPTY_ERRORS) return json({ ...data, error: null, errors: [] });
  if (value === X_TOP) return json({ id: 'valid_123', errors: [] });
  if (value === X_TOP_ERROR) return json({ id: 'valid_123', errors: [{ message: 'sensitive-fixture' }] });
  return json(data);
};
global.fetch = async (url, opts = {}) => {
  const u = new URL(url); requests.push({ host: u.host, path: u.pathname, method: opts.method || 'GET' });
  if (u.origin === 'https://storage.fixture') return { ok: true, status: 200, headers: { get: () => '4' }, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer };
  if (u.origin === 'https://www.googleapis.com' && opts.method === 'POST') return { ok: true, headers: { get: () => 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=fixture' } };
  if (u.origin === 'https://www.googleapis.com' && opts.method === 'PUT') return reply('youtube', { id: id('youtube') });
  if (u.origin === 'https://graph.facebook.com' && u.pathname.endsWith('/videos')) return reply('facebook', { id: id('facebook') });
  if (u.origin === 'https://graph.facebook.com' && u.pathname.endsWith('/instagram/media')) return reply('instagram-create', { id: id('instagram-create') });
  if (u.origin === 'https://graph.facebook.com' && u.pathname.endsWith('/valid_123')) return json({ status_code: 'FINISHED' });
  if (u.origin === 'https://graph.facebook.com' && u.pathname.endsWith('/instagram/media_publish')) return reply('instagram-publish', { id: id('instagram-publish') });
  if (u.origin === 'https://api.x.com' && u.pathname.endsWith('/media/upload')) return reply('x-media', { data: { id: id('x-media') } });
  if (u.origin === 'https://api.x.com' && u.pathname.endsWith('/tweets')) return reply('x-post', { data: { id: id('x-post') } });
  throw Error('blocked unexpected network');
};
// Fixture-only policy override to exercise retained, disabled Meta implementations.
// No production path uses this override; all network here is mocked.
const platformFixture = require("../lib/platforms");
const actualCanPublish = platformFixture.canPublish;
platformFixture.canPublish = p => ["facebook", "instagram"].includes(p) || actualCanPublish(p);
const { publishRow } = require('../lib/publish');
const oldTimeout = global.setTimeout;
global.setTimeout = fn => { fn(); return 0; }; // local Instagram polling only
async function run(p, stage, v) {
  platform = p; badStage = stage; value = v; requests = [];
  row = { id: 'job', user_id: 'owner', platform, connection_id: null, status: 'scheduled', video_path: 'owner/video.mp4', title: 'fixture' };
  const out = await publishRow({ ...row }); return { out, requests: [...requests], status: row.status, savedError: row.error };
}
(async () => {
  const stages = [['youtube','youtube'], ['facebook','facebook'], ['instagram','instagram-create'], ['instagram','instagram-publish'], ['x','x-media'], ['x','x-post']];
  for (const [p, stage] of stages) {
    for (const invalid of [NULL_BODY, ERROR_BODY, ERRORS_BODY, null, '', '  ', 123, {}, ['id'], 'foo/bar', 'foo?bar', 'abc\n', 'abc\r', 'x'.repeat(257)]) {
      const result = await run(p, stage, invalid);
      assert.equal(result.out.ok, false, `${p}/${stage}`); assert.equal(result.status, 'failed');
      assert.match(result.out.error, /تعذّر التحقق/); assert.match(result.out.error, /راجع المنصة/);
      assert.match(result.savedError, /راجع المنصة قبل أي إعادة نشر/);
      assert(!result.savedError.includes('sensitive-fixture'), 'do not store raw provider details');
      if (stage === 'instagram-create') assert(!result.requests.some(r => r.path.endsWith('/media_publish')));
      if (stage === 'x-media') assert(!result.requests.some(r => r.path.endsWith('/tweets')));
    }
    const emptyErrors = await run(p, stage, EMPTY_ERRORS);
    assert.equal(emptyErrors.out.ok, true, `${p}/${stage} empty errors`);
  }
  const topError = await run('x', 'x-media', X_TOP_ERROR);
  assert.equal(topError.out.ok, false); assert.match(topError.savedError, /راجع المنصة/);
  assert(!topError.requests.some(r => r.path.endsWith('/tweets')));
  const topOk = await run('x', 'x-media', X_TOP);
  assert.equal(topOk.out.ok, true); assert.equal(topOk.status, 'published');
  for (const p of ['youtube','facebook','instagram','x']) {
    const result = await run(p, '', null); assert.equal(result.out.ok, true, p); assert.equal(result.status, 'published');
  }
  console.log('PASS malformed IDs and contradictory provider errors fail for review; valid synthetic responses succeed; no provider traffic');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { global.setTimeout = oldTimeout; });

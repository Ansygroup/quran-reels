#!/usr/bin/env node
/* اختبار مسار HTTP بقاعدة ومولّد محاكيين — لا اتصال ولا نشر حقيقي. */
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const dbPath = require.resolve('../lib/db');
const sessPath = require.resolve('../lib/sess');
const autoPath = require.resolve('../lib/autopilot');
let active = [], recent = [], config, result, generated = [], reads = [];
const saved = { enabled: false, all_channels: true, platforms: ['youtube', 'tiktok'], template: { content_mode: 'famous', reciter_mode: 'rotate', background: 'rotate' } };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  q1: async () => config,
  rest: async (path) => {
    reads.push(path);
    if (path.includes('status=eq.rendering')) return active;
    if (path.includes('run_type=eq.manual')) return recent;
    throw Error('unexpected query: ' + path);
  },
} };
require.cache[sessPath] = { id: sessPath, filename: sessPath, loaded: true, exports: { getUserId: async req => req.headers.authorization ? 'u1' : null } };
require.cache[autoPath] = { id: autoPath, filename: autoPath, loaded: true, exports: {
  RECITERS: [], CONTENT_MODES: new Set(['mix']), BACKGROUND_IDS: new Set(['rotate']), parseTemplate: t => t,
  generateAndPublish: async (...args) => { generated.push(args); return result; },
} };
const api = require('../api/autopilot');
async function request(action, auth = true) {
  const req = Readable.from([JSON.stringify({ action })]);
  req.method = 'POST'; req.url = '/api/autopilot'; req.headers = auth ? { authorization: 'Bearer test' } : {};
  const res = { setHeader() {}, end(v) { this.body = JSON.parse(v); } };
  await api(req, res);
  return res;
}
(async () => {
  for (const action of ['run', 'run_all']) {
    config = saved; active = []; recent = []; generated = []; reads = [];
    result = { ok: true, run_id: 'r1', url: 'https://example.test/a' };
    let r = await request(action);
    assert.equal(r.statusCode, 200); assert.equal(r.body.run_id, 'r1');
    assert.equal(generated.length, 1); assert.equal(generated[0][0], 'u1');
    assert.equal(generated[0][1].runType, 'manual'); assert.deepEqual(generated[0][1].config, saved);
    assert(reads.every(p => p.includes('user_id=eq.u1')));
    generated = []; result = { ok: false, stage: 'publish', error: 'فشل هدف واحد' };
    r = await request(action); assert.equal(r.statusCode, 502); assert.equal(r.body.error, 'فشل هدف واحد'); assert.equal(generated.length, 1);
    generated = []; result = { ok: false, error: 'المنصات المختارة غير مرتبطة (tiktok)' };
    r = await request(action); assert.equal(r.statusCode, 502); assert.match(r.body.error, /tiktok/); assert.deepEqual(generated[0][1].config.platforms, ['youtube', 'tiktok']);
    generated = []; active = [{ id: 'running' }]; r = await request(action); assert.equal(r.statusCode, 409); assert.equal(generated.length, 0);
    active = []; recent = [{id:1},{id:2},{id:3}]; r = await request(action); assert.equal(r.statusCode, 429); assert.equal(generated.length, 0);
    recent = null; r = await request(action); assert.equal(r.statusCode, 500); assert.equal(generated.length, 0);
    recent = []; active = null; r = await request(action); assert.equal(r.statusCode, 500); assert.equal(generated.length, 0);
    active = []; config = { ...saved, all_channels: false, platforms: ['youtube'] }; result = {ok:true};
    r = await request(action); assert.equal(r.statusCode, 200); assert.equal(generated[0][1].config.all_channels, false);
    generated = []; r = await request(action, false); assert.equal(r.statusCode, 401); assert.equal(generated.length, 0);
  }
  console.log('ALL OK: manual run aliases use one generation and saved targets, honest failures and common guards (mock API)');
})().catch(e => { console.error(e); process.exitCode = 1; });

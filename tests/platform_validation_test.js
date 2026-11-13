#!/usr/bin/env node
/* حفظ حقيقي عبر API بقاعدة وجلسة محاكيتين؛ لا تعديل في الإنتاج. */
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const dbPath = require.resolve('../lib/db'), sessPath = require.resolve('../lib/sess');
let writes = [], reads = [];
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  q1: async () => null, q: async () => [],
  rest: async (path, opts = {}) => {
    if (opts.method === 'POST') { const row = JSON.parse(opts.body).p_config; writes.push(row); return [{...row, settings_revision:'11111111-1111-4111-8111-111111111111'}]; }
    reads.push(path);
    if (path.includes('/social_connections')) return [{platform:'youtube'}, {platform:'tiktok'}];
    throw Error('unexpected read ' + path);
  },
} };
require.cache[sessPath] = { id: sessPath, filename: sessPath, loaded: true, exports: { getUserId: async () => 'u1' } };
const api = require('../api/autopilot');
const { validatePlatforms } = require('../lib/platforms');
async function save(body) {
  const req = Readable.from([JSON.stringify({action:'save', expected_revision:null, ...body})]);
  Object.assign(req, { method:'POST', url:'/api/autopilot', headers:{} });
  const res = {setHeader(){}, end(v){this.body=JSON.parse(v)}}; await api(req, res); return res;
}
(async () => {
  assert.equal(validatePlatforms(['youtube','tiktok']), null);
  assert.equal(validatePlatforms([], {allowEmpty:true}), null);
  for (const invalid of [undefined, null, 'youtube', {}, ['youtube','telegram'], ['youtube','youtube'], ['__proto__'], [null]]) {
    writes=[]; reads=[];
    const r = await save({enabled:false, platforms:invalid, all_channels:true});
    assert.equal(r.statusCode, 400); assert.match(r.body.error, /منصة|المنصات/);
    assert.equal(writes.length, 0); assert.equal(reads.length, 0);
  }
  writes=[]; let r=await save({enabled:true, platforms:[]});
  assert.equal(r.statusCode, 400); assert.equal(writes.length,0);
  writes=[]; r=await save({enabled:false, platforms:[], all_channels:true});
  assert.equal(r.statusCode,200); assert.deepEqual(writes[0].platforms,[]); assert.equal(writes[0].enabled,false); assert.equal(writes[0].all_channels,true);
  for (const all_channels of [true,false]) {
    writes=[]; r=await save({enabled:true, platforms:['youtube','tiktok'], all_channels});
    assert.equal(r.statusCode,200); assert.deepEqual(writes[0].platforms,['youtube','tiktok']); assert.equal(writes[0].all_channels,all_channels); assert.equal(writes[0].enabled,true);
  }
  console.log('ALL OK: API rejects invalid or duplicate platforms, preserves empty paused and valid selected targets (mock database)');
})().catch(e => {console.error(e);process.exitCode=1});

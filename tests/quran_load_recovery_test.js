'use strict';
// Local fixture tests only: structural checks do not establish textual correctness.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = JSON.parse(fs.readFileSync('public/data/quran-uthmani.json', 'utf8'));
const script = fs.readFileSync('public/js/quran.js', 'utf8');
function setup(fetch) {
  const context = vm.createContext({ fetch, window: {} });
  vm.runInContext(script, context);
  return vm.runInContext('Quran', context);
}
const response = data => ({ ok: true, json: async () => data });
(async () => {
  let calls = 0, release;
  const blocked = new Promise((_, reject) => { release = reject; });
  const q = setup(() => { calls++; return calls === 1 ? blocked : Promise.resolve(response(source)); });
  const one = q.load(), two = q.load(); assert.equal(calls, 1);
  release(Error('offline'));
  await assert.rejects(one, /offline/); await assert.rejects(two, /offline/);
  assert.equal(q._loading, null); assert.equal(q.data, null); assert.equal(q.surahs.length, 0);
  const [a, b] = await Promise.all([q.load(), q.load()]);
  assert.equal(calls, 2); assert.equal(a, b); assert.equal(q.surahs.length, 114);
  assert.equal(q.ayah(1, 1), source.data.surahs[0].ayahs[0].text);
  assert.equal(q.ayahCount(112), source.data.surahs[111].ayahs.length);
  await q.load(); assert.equal(calls, 2, 'successful data is reused');

  for (const bad of [
    () => ({ ok: false, status: 503, json: async () => source }),
    () => ({ ok: true, json: async () => { throw Error('bad JSON'); } }),
    () => response({ data: {} }),
    () => { const copy = structuredClone(source); copy.data.surahs.pop(); return response(copy); },
    () => { const copy = structuredClone(source); copy.data.surahs[1].number = 4; return response(copy); },
    () => { const copy = structuredClone(source); copy.data.surahs[0].ayahs[0].numberInSurah = 9; return response(copy); },
    () => { const copy = structuredClone(source); copy.data.surahs[0].ayahs[0].text = ''; return response(copy); },
    () => { const copy = structuredClone(source); copy.data.surahs[0].numberOfAyahs = 99; return response(copy); },
    () => { const copy = structuredClone(source); copy.data.surahs[113].ayahs.pop(); return response(copy); },
  ]) {
    let n = 0; const player = setup(async () => (++n === 1 ? bad() : response(source)));
    await assert.rejects(player.load());
    assert.equal(player._loading, null); assert.equal(player.data, null); assert.equal(player.surahs.length, 0);
    await player.load(); assert.equal(n, 2); assert.equal(player.surahs.length, 114);
  }
  const atomic = setup(async () => response({ data: { surahs: [] } }));
  atomic.surahs = [{ n: 99 }]; await assert.rejects(atomic.load(), /غير مكتملة/);
  assert.equal(atomic.surahs[0].n, 99); assert.equal(atomic.data, null);
  console.log('Quran load PASS: concurrent requests, failures, structural validation, atomic state and retry');
})().catch(error => { console.error(error); process.exitCode = 1; });

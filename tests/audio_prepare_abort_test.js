'use strict';
// Abort tests do not contact a network or record a video.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function setup(fetch, decode = async () => ({ duration: 2 })) {
  const env = vm.createContext({ window: {}, AbortController, fetch, setTimeout, clearTimeout,
    Quran: { ayah: () => 'test verse' }, pad: n => String(n).padStart(3, '0') });
  vm.runInContext(fs.readFileSync('public/js/reel.js', 'utf8'), env);
  const player = vm.runInContext('AyahPlayer', env);
  player.ctx = { state: 'running', decodeAudioData: decode };
  return player;
}
const verses = [{ s: 48, a: 4 }, { s: 48, a: 5 }];
const ok = () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
const pendingFetch = (calls, pending) => (url, { signal }) => {
  calls.push(url); pending.signal = signal;
  return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('fetch cancelled')), { once: true }));
};
(async () => {
  let calls = [], pending = {}, c = new AbortController(), player = setup(pendingFetch(calls, pending));
  c.abort(); await assert.rejects(player.prepare('reciter', verses, null, c.signal), /aborted/); assert.equal(calls.length, 0);
  c = new AbortController(); let progress = []; let result = player.prepare('reciter', verses, (...p) => progress.push(p), c.signal);
  assert.equal(calls.length, 1); c.abort(); await assert.rejects(result, /aborted/);
  assert(pending.signal.aborted); assert.equal(calls.length, 1, 'must not try fallback'); assert.equal(player.cache.size, 0); assert.equal(progress.length, 0);

  calls = []; pending = {}; c = new AbortController();
  const slow = pendingFetch(calls, pending);
  player = setup((url, options) => { if (calls.length === 0) { calls.push(url); return Promise.reject(new Error('proxy down')); } return slow(url, options); });
  result = player.prepare('reciter', verses, null, c.signal);
  await new Promise(r => setImmediate(r)); assert.equal(calls.length, 2); c.abort();
  await assert.rejects(result, /aborted/); assert(pending.signal.aborted); assert.equal(calls.length, 2);

  let resolveDecode;
  player = setup(async () => ok(), () => new Promise(resolve => { resolveDecode = resolve; }));
  c = new AbortController(); progress = []; result = player.prepare('reciter', verses, (...p) => progress.push(p), c.signal);
  await new Promise(r => setImmediate(r)); c.abort(); await assert.rejects(result, /aborted/);
  resolveDecode({ duration: 2 }); await new Promise(r => setImmediate(r));
  assert.equal(player.cache.size, 0, 'late decode must not mutate cache'); assert.equal(progress.length, 0);
  player.ctx.decodeAudioData = async () => ({ duration: 2 });
  const retry = await player.prepare('reciter', verses, null, new AbortController().signal);
  assert.equal(retry.ok, 2); assert.equal(player.cache.size, 2);

  calls = []; player = setup(async url => { calls.push(url); if (url.startsWith('/proxy')) throw Error('proxy down'); return ok(); });
  const fallback = await player.prepare('reciter', [verses[0]], null, new AbortController().signal);
  assert.equal(fallback.ok, 1); assert.equal(calls.length, 2); assert(calls[1].startsWith('https://everyayah.com/'));
  calls = []; player = setup(async url => { calls.push(url); return ok(); }); c = new AbortController();
  await assert.rejects(player.prepare('reciter', verses, () => c.abort(), c.signal), /aborted/);
  assert.equal(calls.length, 1); assert.equal(player.cache.size, 1, 'already decoded verse can be reused');
  console.log('Audio preparation abort PASS: proxy/fallback fetch, decoding, late results, cached retry and progress');
})().catch(error => { console.error(error); process.exitCode = 1; });

'use strict';
/* Simulate delayed Web Audio onended without network, real recitations or publication. */
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function fixture() {
  let id = 0;
  const pending = new Map();
  const context = vm.createContext({ window: {}, console,
    requestAnimationFrame: fn => { const n = ++id; pending.set(n, fn); return n; },
    cancelAnimationFrame: n => pending.delete(n), performance: { now: () => 0 } });
  vm.runInContext(fs.readFileSync('public/js/reel.js', 'utf8'), context);
  const player = vm.runInContext('AyahPlayer', context);
  player.ctx = { state: 'running', currentTime: 0, createBufferSource() {
    return { connect() {}, start() {}, stop() {}, disconnect() {}, onended: null };
  } };
  player.gain = {}; player.reciter = 'test';
  player.ayat = [{s:48,a:4},{s:48,a:5},{s:48,a:6}];
  player.estimates = [2,2,2];
  for (const v of player.ayat) player.cache.set(`test/${v.s}:${v.a}`, { duration: 2 });
  return { player, pending, step(time) {
    player.ctx.currentTime = time;
    assert.equal(pending.size, 1, 'exactly one playback animation callback must be pending');
    const [key, fn] = pending.entries().next().value; pending.delete(key); fn();
  } };
}

{
  const f = fixture(), p = f.player, ticks = [];
  let ends = 0; p.onTick = (elapsed, total, index) => ticks.push({elapsed, index}); p.onEnd = () => ends++;
  p.play(); f.step(0.5); assert.equal(ticks.at(-1).index, 0);
  const lateOnEnded = p._src.onended;
  f.step(2.7); assert.equal(p.index, 1, 'fallback advances when onended is delayed');
  assert.equal(f.pending.size, 1, 'fallback must keep reporting playback progress');
  lateOnEnded(); assert.equal(p.index, 1, 'late old event must not skip the next verse');
  f.step(3.2); assert.equal(ticks.at(-1).index, 1);
  p._src.onended(); assert.equal(p.index, 2, 'normal onended still advances');
  f.step(3.5); assert.equal(ticks.at(-1).index, 2);
  f.step(6.2); assert.equal(ends, 1); assert.equal(f.pending.size, 0, 'no loop after final verse');
}
{
  const f = fixture(), p = f.player;
  p.onAyah = i => { if (i === 1) p.pause(); };
  p.play(); f.step(2.7);
  assert(p.paused); assert.equal(f.pending.size, 0, 'do not schedule another tick after pause');
  p.resume(); assert.equal(f.pending.size, 1, 'resume restarts the loop'); p.stop(); assert.equal(f.pending.size, 0);
}
console.log('AyahPlayer PASS: delayed onended fallback keeps progress and respects pause, resume and end');

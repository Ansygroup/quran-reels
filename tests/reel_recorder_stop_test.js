'use strict';
/* Test MediaRecorder event ordering without making any network calls. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/js/reel.js', 'utf8');

function fixture(mode) {
  let instance, videoStops = 0, playerStops = 0;
  const progress = [];
  class FakeRecorder {
    constructor() { this.state = 'inactive'; instance = this; }
    static isTypeSupported(type) { return type === 'video/webm'; }
    start() {
      if (mode === 'start-error') throw new Error('start failed');
      this.state = 'recording';
      if (mode !== 'empty') this.ondataavailable({ data: new Blob(['prefix']) });
      if (mode === 'error') setTimeout(() => this.onerror({ error: new Error('encoder failed') }), 5);
      if (mode === 'unexpected-stop') setTimeout(() => { this.state = 'inactive'; this.onstop(); }, 5);
    }
    stop() {
      if (mode === 'stop-error') throw new Error('stop failed');
      this.state = 'inactive';
      if (mode === 'timeout') return;
      const finish = () => {
        if (mode !== 'empty') this.ondataavailable({ data: new Blob(['-last']) });
        this.onstop();
      };
      if (mode === 'synchronous-stop') finish();
      else setTimeout(finish, mode === 'delayed' ? 350 : 1);
    }
  }
  // Shorten the post-playback delay and the 20-second failure timeout, but not the delayed final chunk.
  const clock = (fn, ms) => setTimeout(fn, ms === 500 ? 10 : ms === 20000 ? 650 : ms);
  const ctx = vm.createContext({ window: { MediaRecorder: FakeRecorder }, MediaRecorder: FakeRecorder,
    Blob, setTimeout: clock, clearTimeout, requestAnimationFrame: () => 1, cancelAnimationFrame: () => {}, console });
  vm.runInContext(source, ctx);
  const recorder = vm.runInContext('ReelRecorder', ctx);
  const track = { stop() { videoStops++; } };
  const canvas = { height: 1280, captureStream: () => ({ getVideoTracks: () => [track] }) };
  const player = { silent: true, index: 0, totalDuration: () => 1, elapsedBefore: () => 0,
    play() {}, stop() { playerStops++; } };
  const renderer = { state: {}, draw() {} };
  const controller = new AbortController();
  const run = () => recorder.record({ canvas, renderer, player, signal: controller.signal, onProgress: p => progress.push(p) });
  return { run, player, controller, progress, get instance() { return instance; }, get videoStops() { return videoStops; }, get playerStops() { return playerStops; } };
}

(async () => {
  let f = fixture('delayed');
  let result = f.run(); f.player.onEnd();
  let settled = false; result.then(() => { settled = true; });
  await new Promise(r => setTimeout(r, 290));
  assert.equal(settled, false, 'must wait for final dataavailable and stop, not a fixed 260ms');
  assert(!f.progress.includes(1), 'completion is not reported before finalization');
  assert.equal(await (await result).blob.text(), 'prefix-last');
  assert.deepEqual(f.progress, [1]); assert.equal(f.videoStops, 1); assert(f.playerStops);
  f.controller.abort(); assert.equal(f.videoStops, 1, 'completed recording removes abort listener');
  f = fixture('synchronous-stop'); result = f.run(); f.player.onEnd();
  assert.equal(await (await result).blob.text(), 'prefix-last'); assert.equal(f.videoStops, 1);

  for (const [mode, message] of [['empty', /فارغ/], ['start-error', /start failed/], ['stop-error', /stop failed/],
    ['error', /encoder failed/], ['unexpected-stop', /قبل اكتماله/], ['timeout', /تعذّر إنهاء/]]) {
    f = fixture(mode); result = f.run();
    if (['empty', 'stop-error', 'timeout'].includes(mode)) f.player.onEnd();
    await assert.rejects(result, message, mode);
    assert.equal(f.videoStops, 1, `${mode}: video track stopped`);
    assert(!f.progress.includes(1), `${mode}: no false success`);
  }
  f = fixture('delayed'); f.controller.abort();
  await assert.rejects(f.run(), /aborted/); assert.equal(f.videoStops, 1);
  f = fixture('delayed'); result = f.run(); f.player.onEnd();
  setTimeout(() => f.controller.abort(), 30); // during finalization
  await assert.rejects(result, /aborted/); assert.equal(f.videoStops, 1);
  console.log('ReelRecorder PASS: delayed final chunk, completion, abort, error, timeout, cleanup and empty file');
})().catch(error => { console.error(error); process.exitCode = 1; });

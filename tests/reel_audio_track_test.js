'use strict';
// Isolated recorder tests: no accounts, uploads or real audio.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/js/reel.js', 'utf8');
function fixture({ silent = false, tracks = [new Track()], add = true, constructorError = false } = {}) {
  let captures = 0, videoStops = 0, playerStops = 0, constructed = 0, recorder;
  const progress = [];
  const stream = { audio: [], getVideoTracks: () => [{ stop() { videoStops++; } }],
    addTrack(t) { if (add) this.audio.push(t); }, getAudioTracks() { return this.audio; } };
  class FakeRecorder {
    static isTypeSupported(type) { return type === 'video/webm'; }
    constructor() { constructed++; if (constructorError) throw Error('constructor failed'); this.state = 'inactive'; recorder = this; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; setTimeout(() => { this.ondataavailable({data: new Blob(['file'])}); this.onstop(); }, 10); }
  }
  const context = vm.createContext({ window: { MediaRecorder: FakeRecorder }, MediaRecorder: FakeRecorder, Blob,
    setTimeout: (fn, ms) => setTimeout(fn, ms === 500 ? 10 : ms), clearTimeout,
    requestAnimationFrame: () => 1, cancelAnimationFrame: () => {}, console });
  vm.runInContext(source, context);
  const instance = vm.runInContext('ReelRecorder', context);
  const canvas = { height: 1280, captureStream() { captures++; return stream; } };
  const player = { silent, dest: { stream: { getAudioTracks: () => tracks } }, totalDuration: () => 1,
    elapsedBefore: () => 0, play() {}, stop() { playerStops++; } };
  const controller = new AbortController();
  return { player, controller, tracks, stream, progress,
    run: () => instance.record({ canvas, player, renderer: { state: {}, draw() {} }, signal: controller.signal, onProgress: p => progress.push(p) }),
    get captures() { return captures; }, get videoStops() { return videoStops; }, get playerStops() { return playerStops; }, get constructed() { return constructed; }, get recorder() { return recorder; } };
}
class Track extends EventTarget {
  constructor() { super(); this.readyState = 'live'; this.enabled = true; this.stops = 0; }
  stop() { this.readyState = 'ended'; this.stops++; } // stop() does not fire ended per spec
  end() { this.readyState = 'ended'; this.dispatchEvent(new Event('ended')); }
}
(async () => {
  let f = fixture({ tracks: [] });
  await assert.rejects(f.run(), /تعذّر تسجيل صوت/); assert.equal(f.captures, 0);
  f = fixture(); f.player.dest = null;
  await assert.rejects(f.run(), /تعذّر تسجيل صوت/); assert.equal(f.captures, 0);
  for (const kind of ['ended', 'disabled']) {
    const t = new Track(); if (kind === 'ended') t.stop(); else t.enabled = false;
    f = fixture({ tracks: [t] }); await assert.rejects(f.run(), /تعذّر تسجيل صوت/); assert.equal(f.captures, 0);
  }
  f = fixture({ add: false }); await assert.rejects(f.run(), /تعذّر تسجيل صوت/);
  assert.equal(f.videoStops, 1); assert.equal(f.constructed, 0); assert.equal(f.tracks[0].stops, 0);
  f = fixture({ constructorError: true }); await assert.rejects(f.run(), /constructor failed/);
  assert.equal(f.videoStops, 1); assert.equal(f.tracks[0].stops, 0);
  f = fixture(); let result = f.run(); f.tracks[0].end();
  await assert.rejects(result, /تعذّر تسجيل صوت/); assert.equal(f.videoStops, 1); assert.equal(f.tracks[0].stops, 0); assert(!f.progress.includes(1));
  f = fixture(); result = f.run(); f.tracks[0].stop(); f.player.onTick(0.5, 1);
  await assert.rejects(result, /تعذّر تسجيل صوت/); assert.equal(f.videoStops, 1);
  f = fixture(); result = f.run(); f.player.onEnd(); f.tracks[0].stop();
  await assert.rejects(result, /تعذّر تسجيل صوت/); assert.equal(f.videoStops, 1);
  f = fixture(); result = f.run(); f.player.onEnd(); assert.equal(await (await result).blob.text(), 'file');
  assert.equal(f.videoStops, 1); assert.equal(f.tracks[0].stops, 0); assert.deepEqual(f.progress, [1]);
  f.tracks[0].end(); f.controller.abort(); assert.equal(f.videoStops, 1);
  f = fixture(); result = f.run(); f.controller.abort(); await assert.rejects(result, /aborted/);
  assert.equal(f.videoStops, 1); assert.equal(f.tracks[0].stops, 0);
  f = fixture({ silent: true, tracks: [] }); result = f.run(); f.player.onEnd();
  assert.equal(await (await result).blob.text(), 'file'); assert.equal(f.videoStops, 1);
  console.log('Audio track PASS: missing, disabled, ended, attachment, cleanup, abort, valid and silent paths');
})().catch(error => { console.error(error); process.exitCode = 1; });

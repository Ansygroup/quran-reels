'use strict';
// Isolated recorder tests: no accounts, uploads or real audio.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/js/reel.js', 'utf8');
function fixture({ silent = false, tracks = [new Track()], audioCtx = new AudioCtx(), add = true, constructorError = false } = {}) {
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
    setTimeout: (fn, ms) => setTimeout(fn, ms === 500 ? 10 : ms === 5000 ? 40 : ms), clearTimeout,
    requestAnimationFrame: () => 1, cancelAnimationFrame: () => {}, console });
  vm.runInContext(source, context);
  const instance = vm.runInContext('ReelRecorder', context);
  const canvas = { height: 1280, captureStream() { captures++; return stream; } };
  const player = { silent, ctx: audioCtx, dest: { stream: { getAudioTracks: () => tracks } }, totalDuration: () => 1,
    elapsedBefore: () => 0, play() {}, stop() { playerStops++; } };
  const controller = new AbortController();
  return { player, controller, tracks, stream, progress,
    run: () => instance.record({ canvas, player, renderer: { state: {}, draw() {} }, signal: controller.signal, onProgress: p => progress.push(p) }),
    get captures() { return captures; }, get videoStops() { return videoStops; }, get playerStops() { return playerStops; }, get constructed() { return constructed; }, get recorder() { return recorder; } };
}
class AudioCtx extends EventTarget {
  constructor(state = 'running', resume = null) { super(); this.state = state; this.resumeImpl = resume; this.resumeCalls = 0; }
  resume() { this.resumeCalls++; return this.resumeImpl ? this.resumeImpl(this) : Promise.resolve(); }
  change(state) { this.state = state; this.dispatchEvent(new Event('statechange')); }
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
  f = fixture({ silent: true, tracks: [], audioCtx: null }); result = f.run(); f.player.onEnd();
  assert.equal(await (await result).blob.text(), 'file'); assert.equal(f.videoStops, 1);

  f = fixture({ audioCtx: null }); await assert.rejects(f.run(), /محرّك الصوت/); assert.equal(f.captures, 0);
  f = fixture({ audioCtx: new AudioCtx('closed') }); await assert.rejects(f.run(), /محرّك الصوت/); assert.equal(f.captures, 0);
  f = fixture({ audioCtx: new AudioCtx('suspended', () => Promise.reject(Error('denied'))) });
  await assert.rejects(f.run(), /محرّك الصوت/); assert.equal(f.captures, 0);
  f = fixture({ audioCtx: new AudioCtx('suspended', () => { throw Error('denied'); }) });
  await assert.rejects(f.run(), /محرّك الصوت/); assert.equal(f.captures, 0);
  f = fixture({ audioCtx: new AudioCtx('suspended', () => Promise.resolve()) });
  await assert.rejects(f.run(), /محرّك الصوت/); assert.equal(f.captures, 0);
  let release;
  const waiting = new AudioCtx('suspended', ctx => new Promise(resolve => { release = () => { ctx.state = 'running'; resolve(); }; }));
  f = fixture({ audioCtx: waiting }); result = f.run(); assert.equal(f.captures, 0); release();
  await new Promise(resolve => setImmediate(resolve)); assert.equal(f.captures, 1); f.player.onEnd();
  assert.equal(await (await result).blob.text(), 'file'); assert.equal(waiting.resumeCalls, 1);
  f = fixture({ audioCtx: new AudioCtx('suspended', () => new Promise(() => {})) });
  await assert.rejects(f.run(), /محرّك الصوت/); assert.equal(f.captures, 0);
  let lateResume;
  f = fixture({ audioCtx: new AudioCtx('suspended', ctx => new Promise(resolve => { lateResume = () => { ctx.state = 'running'; resolve(); }; })) });
  result = f.run(); f.controller.abort(); await assert.rejects(result, /aborted/); lateResume();
  await new Promise(resolve => setImmediate(resolve)); assert.equal(f.captures, 0);
  const resumedAfterTrackLoss = new AudioCtx('suspended', ctx => new Promise(resolve => { lateResume = () => { ctx.state = 'running'; resolve(); }; }));
  f = fixture({ audioCtx: resumedAfterTrackLoss }); result = f.run(); f.tracks[0].stop(); lateResume();
  await assert.rejects(result, /تعذّر تسجيل صوت/); assert.equal(f.captures, 0);
  f = fixture(); result = f.run(); f.player.ctx.change('suspended');
  await assert.rejects(result, /توقّف محرّك الصوت/); assert.equal(f.videoStops, 1); assert(!f.progress.includes(1));
  f = fixture(); result = f.run(); f.player.ctx.state = 'closed'; f.player.onTick(0.5, 1);
  await assert.rejects(result, /توقّف محرّك الصوت/); assert.equal(f.videoStops, 1);
  f = fixture(); result = f.run(); f.player.onEnd(); f.player.ctx.change('suspended');
  assert.equal(await (await result).blob.text(), 'file'); assert.equal(f.videoStops, 1);
  f.player.ctx.change('closed'); assert.equal(f.videoStops, 1);
  console.log('Audio track and context PASS: unavailable, suspended, abort, cleanup, valid and silent paths');
})().catch(error => { console.error(error); process.exitCode = 1; });

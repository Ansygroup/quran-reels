'use strict';
const assert = require('node:assert/strict');
const { analyze, toneAt, frameAt, parseArgs, frameTiming } = require('../tools/render_sync_diagnostic');
const showinfo = times => times.map((time, i) => `[Parsed_showinfo_0 @ 0x123] n: ${i} pts: ${i} pts_time:${time} duration: 1`).join('\n');
const native = frameTiming(showinfo([0, 0.1, 1.1]));
assert.equal(native.decoded_frames, 3); assert.equal(native.timestamp_order_valid, true);
assert.equal(native.first_pts_seconds, 0); assert.equal(native.last_pts_seconds, 1.1);
assert(Math.abs(native.max_interval_seconds - 1) < 1e-9);
assert(Math.abs(native.mean_fps_between_first_and_last - 2 / 1.1) < 1e-9);
for (const times of [[], [0, 'NOPTS'], [0, 0], [1, 0]]) {
  const timing = frameTiming(showinfo(times));
  assert.equal(timing.timestamp_order_valid, false); assert.equal(timing.max_interval_seconds, null);
  assert.equal(timing.mean_fps_between_first_and_last, null);
}
assert.equal(frameTiming(showinfo([0])).mean_fps_between_first_and_last, null);
assert.equal(frameTiming(showinfo([0, 1]).replace('] n: 1', '] n: 2')).timestamp_order_valid, false);
assert.equal(frameTiming('[Parsed_showinfo_0 @ 0x123] n: 0 pts: 0').timestamp_order_valid, false);
assert.deepEqual(parseArgs([]), { noGpu: false, stallMs: 0, quality: 720 });
assert.deepEqual(parseArgs(['--quality=1080', '--no-gpu', '--stall-ms=1500']), { noGpu: true, stallMs: 1500, quality: 1080 });
for (const args of [['--quality=480'], ['--quality='], ['--stall-ms='], ['--stall-ms=-1'], ['--stall-ms=10001'], ['--stall-ms=1.5'], ['--no-gpu=true'], ['--quality=720', '--quality=1080'], ['--no-gpu', '--no-gpu'], ['--unknown']]) assert.throws(() => parseArgs(args));
const rate = 8000, size = 800;
function pcm(frequencies) {
  const buf = Buffer.alloc(frequencies.length * size * 4);
  frequencies.forEach((freq, window) => {
    for (let i = 0; i < size; i++) buf.writeFloatLE(freq ? 0.12 * Math.sin(2 * Math.PI * freq * i / rate) : 0, (window * size + i) * 4);
  });
  return buf;
}
const colors = { r: [240, 5, 5], g: [2, 240, 3], b: [2, 5, 240], unknown: [10, 10, 10] };
const video = names => Buffer.from(names.flatMap(name => colors[name]));
const audio = pcm([440, 440, 660, 660, 880, 0]);
assert.equal(toneAt(audio, 0), 0); assert.equal(toneAt(audio, 2 * size), 1);
assert.equal(toneAt(audio, 4 * size), 2); assert.equal(toneAt(audio, 5 * size), null);
const mixed = Buffer.alloc(size * 4);
for (let i = 0; i < size; i++) mixed.writeFloatLE(0.08 * (Math.sin(2 * Math.PI * 440 * i / rate) + Math.sin(2 * Math.PI * 660 * i / rate)), i * 4);
assert.equal(toneAt(mixed, 0), 'unknown');
assert.equal(frameAt(video(['unknown']), 0), null);
const report = analyze(audio, video(['r', 'r', 'g', 'b', 'unknown', 'r', 'g']));
assert.equal(report.compared_seconds, 0.6); assert.equal(report.all_tones_sampled, true);
assert(Math.abs(report.uncompared_video_seconds - 0.1) < 1e-9);
assert.equal(report.silent_windows, 1); assert.equal(analyze(mixed, video(['r'])).unclassified_audio_windows, 1);
assert.deepEqual(report.tones.map(t => [t.windows, t.matched, t.mismatched, t.unclassified_frame]), [[2, 2, 0, 0], [2, 1, 1, 0], [1, 0, 0, 1]]);
assert.deepEqual(report.mismatches, [{ start_seconds: 0.3, end_seconds: 0.4, audio_index: 1, frame_index: 2 }]);
const truncated = analyze(audio, video(['r', 'r']));
assert.equal(truncated.compared_seconds, 0.2); assert.equal(truncated.all_tones_sampled, false);
assert(Math.abs(truncated.uncompared_audio_seconds - 0.4) < 1e-9);
assert.equal(analyze(Buffer.alloc(0), Buffer.alloc(0)).all_tones_sampled, false);
assert.throws(() => analyze(Buffer.alloc(3), Buffer.alloc(3)), /Invalid/);
assert.throws(() => analyze(Buffer.alloc(4), Buffer.alloc(2)), /Invalid/);
console.log('Render sync diagnostic PASS: tone/marker classification, mismatches, unknown markers and unexamined tails');

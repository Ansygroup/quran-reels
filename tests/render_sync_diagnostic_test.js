'use strict';
const assert = require('node:assert/strict');
const { analyze, toneAt, frameAt } = require('../tools/render_sync_diagnostic');
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
assert.equal(report.compared_seconds, 0.6); assert(Math.abs(report.uncompared_video_seconds - 0.1) < 1e-9);
assert.equal(report.silent_windows, 1); assert.equal(analyze(mixed, video(['r'])).unclassified_audio_windows, 1);
assert.deepEqual(report.tones.map(t => [t.windows, t.matched, t.mismatched, t.unclassified_frame]), [[2, 2, 0, 0], [2, 1, 1, 0], [1, 0, 0, 1]]);
assert.deepEqual(report.mismatches, [{ start_seconds: 0.3, end_seconds: 0.4, audio_index: 1, frame_index: 2 }]);
const truncated = analyze(audio, video(['r', 'r']));
assert.equal(truncated.compared_seconds, 0.2); assert(Math.abs(truncated.uncompared_audio_seconds - 0.4) < 1e-9);
assert.throws(() => analyze(Buffer.alloc(3), Buffer.alloc(3)), /Invalid/);
assert.throws(() => analyze(Buffer.alloc(4), Buffer.alloc(2)), /Invalid/);
console.log('Render sync diagnostic PASS: tone/marker classification, mismatches, unknown markers and unexamined tails');

'use strict';
// Optional integration test: requires ffmpeg with lavfi and libvpx-vp9.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { inspectFrameTiming } = require('../tools/render_sync_diagnostic');
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quran-frame-timing-test-'));
try {
  const file = path.join(dir, 'variable.webm');
  const result = spawnSync(ffmpeg, ['-hide_banner', '-v', 'error', '-f', 'lavfi', '-i', 'color=red:s=64x64:r=10:d=1',
    '-vf', "select='eq(n,0)+eq(n,1)+eq(n,8)'", '-fps_mode', 'passthrough', '-c:v', 'libvpx-vp9', file]);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(String(result.stderr));
  const timing = inspectFrameTiming(ffmpeg, file);
  assert.equal(timing.decoded_frames, 3);
  assert.equal(timing.timestamp_order_valid, true);
  assert(Math.abs(timing.first_pts_seconds) < 0.01);
  assert(Math.abs(timing.last_pts_seconds - 0.8) < 0.01);
  assert(Math.abs(timing.max_interval_seconds - 0.7) < 0.01);
  assert(Math.abs(timing.mean_fps_between_first_and_last - 2.5) < 0.05);
  console.log('Native frame timing integration PASS (3 variable-timestamp frames)');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }

'use strict';
// Synthetic in-process measurement only. No video files, network or provider.
// Run: node scripts/measure_bounded_read_candidate.js
// Each concurrency level runs in a separate Node child with forced baseline GC.
const { spawnSync } = require('node:child_process');
const { readBoundedVideoCandidate } = require('../lib/publish_bounded_read_candidate');
const perRead = 4 * 1024 * 1024, chunk = 64 * 1024;
if (process.argv[2] !== '--worker') {
  for (const n of [1, 4]) {
    const child = spawnSync(process.execPath, ['--expose-gc', __filename, '--worker', String(n)], { encoding: 'utf8', timeout: 30000 });
    if (child.error || child.status !== 0) { console.error(child.error || child.stderr); process.exit(1); }
    console.log(child.stdout.trim());
  }
} else {
  const count = Number(process.argv[3]);
  if (![1, 4].includes(count) || !global.gc) throw Error('invalid worker');
  global.fetch = async () => { throw Error('network disabled'); };
  const fakeFetch = async () => {
    let left = perRead;
    return { ok: true, status: 200, headers: { get: () => null }, body: new ReadableStream({
      async pull(controller) {
        await new Promise(resolve => setImmediate(resolve));
        if (!left) return controller.close();
        const n = Math.min(left, chunk); left -= n; controller.enqueue(new Uint8Array(n).fill(7));
      },
    }) };
  };
  const mib = x => Math.round(x / (1024 * 1024) * 100) / 100;
  (async () => {
    global.gc(); const baseline = process.memoryUsage(); let peakRss = baseline.rss, peakBuffers = baseline.arrayBuffers;
    const sample = () => { const m = process.memoryUsage(); peakRss = Math.max(peakRss, m.rss); peakBuffers = Math.max(peakBuffers, m.arrayBuffers); };
    const timer = setInterval(sample, 1), start = performance.now();
    try {
      const results = await Promise.all(Array.from({ length: count }, () => readBoundedVideoCandidate('fixture', { maxBytes: perRead, timeoutMs: 10000, fetchImpl: fakeFetch })));
      sample(); if (results.some(b => b.length !== perRead)) throw Error('invalid synthetic result');
      console.log(JSON.stringify({ concurrency: count, per_read_mib: mib(perRead), total_returned_mib: mib(results.reduce((s,b) => s+b.length, 0)), baseline_rss_mib: mib(baseline.rss), sampled_peak_rss_mib: mib(peakRss), sampled_peak_arraybuffers_mib: mib(peakBuffers), elapsed_ms: Math.round(performance.now()-start) }));
    } finally { clearInterval(timer); }
  })().catch(error => { console.error(error); process.exitCode = 1; });
}

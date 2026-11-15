'use strict';
// An unwired candidate invoked with synthetic promises; network always blocked.
const assert = require('node:assert/strict');
const { publishBatchLimitCandidate: run } = require('../lib/publish_batch_limit_candidate');
global.fetch = async () => { throw Error('external network blocked'); };
const targets = n => Array.from({ length: n }, (_, i) => ({
  platform: 'youtube', connection_id: 'channel-' + i,
  row: { id: 'job-' + i, user_id: 'owner', platform: 'youtube', connection_id: 'channel-' + i, status: 'draft', video_path: 'owner/video.mp4', title: 'original' },
}));
async function within(promise) {
  let timer; try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('test timeout')), 3000); })]); }
  finally { clearTimeout(timer); }
}
(async () => {
  const input = targets(5), starts = [], pending = new Map(), counts = new Map(), listeners = [];
  let active = 0, maxActive = 0;
  const waitFor = n => starts.length >= n ? Promise.resolve() : within(new Promise(resolve => listeners.push({ n, resolve })));
  const publish = async row => {
    starts.push({ ...row }); counts.set(row.id, (counts.get(row.id) || 0) + 1);
    active++; maxActive = Math.max(maxActive, active);
    for (const item of listeners.filter(x => starts.length >= x.n)) item.resolve();
    return new Promise((resolve, reject) => pending.set(row.id, { resolve, reject })).finally(() => { active--; });
  };
  const batch = run(input, { limit: 2, publish });
  await waitFor(2); assert.deepEqual(starts.map(x => x.id), ['job-0', 'job-1']); assert.equal(active, 2);
  // Candidate snapshots confirmed entries before waiting for a worker slot.
  input[2].row.title = 'changed-after-accept';
  // Simulate a provider action followed by a lost response; exactly one call.
  pending.get('job-1').reject(Error('fixture ambiguous result')); await waitFor(3);
  assert.equal(starts[2].title, 'original');
  pending.get('job-2').resolve({ ok: true, url: 'fixture:2' }); await waitFor(4);
  pending.get('job-0').resolve({ ok: true, url: 'fixture:0' }); await waitFor(5);
  pending.get('job-3').resolve({ ok: true, url: 'fixture:3' });
  pending.get('job-4').resolve({ ok: 'true', url: 'fixture:4' }); // not an explicit success
  const out = await within(batch);
  assert.equal(maxActive, 2); assert.equal(active, 0); assert.equal(out.failed, 2);
  assert.deepEqual(out.results.map(r => r.status), ['fulfilled', 'rejected', 'fulfilled', 'fulfilled', 'rejected']);
  assert.deepEqual(out.urls, ['fixture:0', 'fixture:2', 'fixture:3']);
  assert.match(out.why, /fixture ambiguous result/); assert.deepEqual([...counts.values()], [1,1,1,1,1]);

  // With limit 1 errors release the slot, remaining distinct rows still run,
  // and malformed success representations do not count as confirmed success.
  let serialActive = 0, serialPeak = 0; const calls = [];
  const serial = await run(targets(4), { limit: 1, publish: async row => {
    calls.push(row.id); serialActive++; serialPeak = Math.max(serialPeak, serialActive);
    await new Promise(resolve => setImmediate(resolve)); serialActive--;
    if (row.id === 'job-0') return { ok: false, error: 'fixture review' };
    if (row.id === 'job-1') throw Error('fixture thrown');
    if (row.id === 'job-2') return { ok: true, url: '' };
    return { ok: true, url: 'fixture:3' };
  } });
  assert.equal(serialPeak, 1); assert.equal(serial.failed, 3); assert.deepEqual(serial.urls, ['fixture:3']); assert.deepEqual(calls, ['job-0','job-1','job-2','job-3']);
  assert.deepEqual(await run([], { limit: 2, publish: async () => { throw Error('unexpected'); } }), { results: [], failed: 0, urls: [], why: '' });
  // Validate the whole batch before starting any work, including duplicate
  // IDs, repeated target pairs, mixed owners and divergent claimed targets.
  let effects = 0; const noSend = async () => { effects++; return { ok: true, url: 'fixture' }; };
  const invalid = [];
  let t = targets(2); t[1].row.id = t[0].row.id; invalid.push(t);
  t = targets(2); t[1].connection_id = t[0].connection_id; t[1].row.connection_id = t[0].connection_id; invalid.push(t);
  t = targets(2); t[1].row.user_id = 'other'; invalid.push(t);
  t = targets(2); t[1].row.platform = 'x'; invalid.push(t);
  t = targets(2); t[1].row.connection_id = null; invalid.push(t);
  t = targets(2); t[1].row.status = 'failed'; invalid.push(t);
  t = targets(2); delete t[1].connection_id; invalid.push(t);
  for (const batchRows of invalid) await assert.rejects(run(batchRows, { limit: 2, publish: noSend }), /invalid candidate target/);
  for (const limit of [0, -1, 1.5, Infinity]) await assert.rejects(run(targets(2), { limit, publish: noSend }), /invalid candidate batch/);
  assert.equal(effects, 0, 'invalid later target must not start earlier jobs');
  console.log('PASS unwired per-batch concurrency candidate: strict bounds, order, partial results, no retry and invalid-batch preflight');
})().catch(e => { console.error(e); process.exitCode = 1; });

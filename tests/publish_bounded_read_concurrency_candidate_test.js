'use strict';
// Candidate reader injected ONLY into a fake publisher; real autopilot's
// publishTargets orchestrates three synthetic jobs. No external network.
const assert = require('node:assert/strict'), http = require('node:http');
const { readBoundedVideoCandidate } = require('../lib/publish_bounded_read_candidate');
const sockets = new Set(), started = [], closed = [];
let base, startedAll;
const allStarted = new Promise(resolve => { startedAll = resolve; });
const server = http.createServer((req, res) => {
  const kind = req.url.slice(1); started.push(kind); if (started.length === 3) startedAll();
  res.once('close', () => closed.push(kind));
  allStarted.then(() => {
    if (kind === 'over') { res.writeHead(200); res.write(Buffer.alloc(64)); res.end(Buffer.alloc(2)); }
    else if (kind === 'stalled') { res.writeHead(200); res.write(Buffer.from([1])); }
    else { res.writeHead(200); setTimeout(() => { if (!res.destroyed) res.end(Buffer.from([1,2,3])); }, 40); }
  }).catch(() => {});
});
server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
const publisher = require.resolve('../lib/publish');
require.cache[publisher] = { id: publisher, filename: publisher, loaded: true, exports: { publishRow: async row => {
  try {
    const bytes = await readBoundedVideoCandidate(base + '/' + row.kind, { maxBytes: 64, timeoutMs: 1000 });
    return { ok: true, url: `fixture:${row.kind}:${bytes.length}` };
  } catch (error) { return { ok: false, error: String(error.message) }; }
} } };
global.fetch = ((real) => (url, opts) => {
  if (!base || new URL(url).origin !== base) throw Error('external network blocked');
  return real(url, opts);
})(global.fetch);
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  try {
    const { __test } = require('../lib/autopilot');
    const targets = ['over', 'stalled', 'good'].map(kind => ({ platform: kind, connection_id: null, row: { kind } }));
    const result = await __test.publishTargets(targets);
    assert.equal(started.length, 3, 'all jobs began concurrently');
    assert.equal(result.failed, 2); assert.deepEqual(result.urls, ['fixture:good:3']);
    assert.equal(result.results[2].status, 'fulfilled', 'one failure must not cancel a separate success');
    assert.equal(result.results[0].status, 'rejected'); assert.equal(result.results[1].status, 'rejected');
    assert.match(result.why, /ضمن حدود الاختبار/); assert(!result.why.includes(base));
    // Candidate failures only affect the fake publisher: these do not assert
    // anything about the real publisher's queue transitions or provider calls.
    console.log('PASS actual target orchestration with fake bounded reader: failure does not cancel sibling; stalled job times out');
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });

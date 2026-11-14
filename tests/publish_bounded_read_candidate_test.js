'use strict';
// Unwired candidate using actual fetch against loopback-only synthetic HTTP.
const assert = require('node:assert/strict'), http = require('node:http'), zlib = require('node:zlib');
const { readBoundedVideoCandidate: read } = require('../lib/publish_bounded_read_candidate');
const sockets = new Set(); let redirectRequests = 0;
const server = http.createServer((req, res) => {
  if (req.url === '/short') return res.writeHead(200, { 'content-length': '4' }).end(Buffer.from([1,2,3,4]));
  if (req.url === '/empty') return res.writeHead(200).end();
  if (req.url === '/partial') return res.writeHead(206).end(Buffer.from([1]));
  if (req.url === '/large-header') return res.writeHead(200, { 'content-length': '1000' }).end(Buffer.alloc(1000));
  if (req.url === '/chunked') { res.writeHead(200); res.write(Buffer.alloc(10, 1)); return res.end(Buffer.alloc(10, 2)); }
  if (req.url === '/chunked-under') { res.writeHead(200); res.write(Buffer.alloc(3, 1)); return res.end(Buffer.alloc(4, 2)); }
  if (req.url === '/stalled-body') { res.writeHead(200); res.write(Buffer.from([1])); return; }
  if (req.url === '/slow-body') {
    res.writeHead(200); res.write(Buffer.from([1]));
    const interval = setInterval(() => res.write(Buffer.from([1])), 25);
    res.once('close', () => clearInterval(interval)); return;
  }
  if (req.url === '/stalled-header') return;
  if (req.url === '/redirect') return res.writeHead(302, { location: '/redirect-target?secret=fixture' }).end();
  if (req.url.startsWith('/redirect-target')) { redirectRequests++; return res.end('unexpected'); }
  if (req.url === '/gzip') { const body = zlib.gzipSync(Buffer.from([1,2,3,4])); return res.writeHead(200, { 'content-encoding': 'gzip', 'content-length': String(body.length) }).end(body); }
  if (req.url === '/gzip-large') { const body = zlib.gzipSync(Buffer.alloc(40, 1)); return res.writeHead(200, { 'content-encoding': 'gzip', 'content-length': String(body.length) }).end(body); }
  res.writeHead(404).end();
});
server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const invoke = (p, maxBytes = 16, timeoutMs = 1000) => read(base + p, { maxBytes, timeoutMs });
  try {
    assert.deepEqual([...await invoke('/short', 4)], [1,2,3,4]);
    assert.deepEqual([...await invoke('/chunked-under', 7)], [1,1,1,2,2,2,2]);
    for (const p of ['/empty', '/partial', '/large-header', '/chunked', '/redirect', '/gzip-large', '/missing']) await assert.rejects(invoke(p), /ضمن حدود الاختبار/);
    assert.equal(redirectRequests, 0);
    assert.deepEqual([...await invoke('/gzip', 4)], [1,2,3,4], 'compressed Content-Length is not decoded length');
    for (const p of ['/stalled-header', '/stalled-body', '/slow-body']) {
      const before = Date.now(); await assert.rejects(invoke(p, 1000, 150), /ضمن حدود الاختبار/);
      assert(Date.now() - before < 3000, 'native fetch aborts a stalled or trickling local response');
    }
    for (const options of [{ maxBytes: 0, timeoutMs: 1 }, { maxBytes: 3, timeoutMs: 0 }, { maxBytes: Infinity, timeoutMs: 1 }, { maxBytes: 3.5, timeoutMs: 1 }]) await assert.rejects(read(base + '/short', options), /invalid candidate limits/);
    // Fake identity body with mismatched/malformed Content-Length and a failed stream.
    const fake = (length, chunks) => ({ ok: true, status: 200, headers: { get: key => key === 'content-length' ? length : null }, body: new ReadableStream({ start(c) { for (const chunk of chunks) c.enqueue(new Uint8Array(chunk)); c.close(); } }) });
    for (const length of ['0', '3', 'bad', '9007199254740992']) await assert.rejects(read('unused', { maxBytes: 16, timeoutMs: 1000, fetchImpl: async () => fake(length, [[1,2,3,4]]) }), /ضمن حدود الاختبار/);
    const failed = { ok: true, status: 200, headers: { get: () => null }, body: new ReadableStream({ start(c) { c.error(Error('secret-fixture')); } }) };
    await assert.rejects(read('unused', { maxBytes: 16, timeoutMs: 1000, fetchImpl: async () => failed }), e => !String(e).includes('secret-fixture'));
    console.log('PASS unwired bounded read candidate: loopback streams, deadlines, redirects and synthetic length errors');
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });

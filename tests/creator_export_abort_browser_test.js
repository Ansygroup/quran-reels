'use strict';
/* Optional Chromium integration test. Local synthetic WAV only: no external network or posts. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '../public');

function toneWav() {
  const samples = 24000, rate = 48000, out = Buffer.alloc(44 + samples * 2);
  out.write('RIFF'); out.writeUInt32LE(36 + samples * 2, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28); out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) out.writeInt16LE(Math.floor(5000 * Math.sin(2 * Math.PI * 440 * i / rate)), 44 + i * 2);
  return out;
}
async function timeout(promise, ms) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Browser test timed out')), ms); })]); }
  finally { clearTimeout(timer); }
}

(async () => {
  const wav = toneWav(), types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ttf': 'font/ttf', '.png': 'image/png' };
  let requests = 0, firstClosed = false, gotFirst;
  const firstRequest = new Promise(resolve => { gotFirst = resolve; });
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/proxy') {
      requests++;
      if (requests === 1) { res.on('close', () => { if (!res.writableEnded) firstClosed = true; }); gotFirst(); return; }
      res.writeHead(200, { 'Content-Type': 'audio/wav' }); res.end(wav); return;
    }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, data) => {
      if (error) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
    });
  });
  let browser;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const { default: binary } = await import(pathToFileURL(require.resolve('@sparticuz/chromium')).href);
    browser = await chromium.launch({ executablePath: await binary.executablePath(), headless: true,
      args: [...binary.args, '--autoplay-policy=no-user-gesture-required', '--disable-gpu'] });
    const context = await browser.newContext({ viewport: { width: 900, height: 1200 }, serviceWorkers: 'block' });
    const page = await context.newPage(), pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    await page.route('**/*', route => {
      let url; try { url = new URL(route.request().url()); } catch { return route.abort(); }
      return url.origin === origin ? route.continue() : route.abort();
    });
    await page.goto(origin + '/', { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => typeof Creator !== 'undefined' && Creator.ready && Quran.data, null, { timeout: 60000 });
    await page.evaluate(() => {
      Selection.quality = 720; Creator.setSelection(48, 4, 6, true);
      window.testRecordCount = 0;
      const record = ReelRecorder.record.bind(ReelRecorder);
      ReelRecorder.record = (...args) => { window.testRecordCount++; return record(...args); };
    });
    const running = page.evaluate(() => Creator.startExport());
    await timeout(firstRequest, 30000);
    await page.evaluate(() => Creator.cancelExport());
    await timeout(running, 5000);
    const cancelled = await page.evaluate(() => ({ exporting: Creator.exporting, reason: Creator.lastAbortReason,
      hidden: document.querySelector('#exportOverlay').hidden, resultHidden: document.querySelector('#expResult').hidden,
      recordCount: window.testRecordCount, prepared: Creator.prepared, cache: AyahPlayer.cache.size }));
    // Give the server's socket close event a chance to run.
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(cancelled.reason, 'aborted'); assert(cancelled.hidden && cancelled.resultHidden && !cancelled.exporting && !cancelled.prepared);
    assert.equal(cancelled.recordCount, 0); assert.equal(cancelled.cache, 0); assert.equal(requests, 1); assert(firstClosed);
    await timeout(page.evaluate(() => Creator.startExport()), 30000);
    const retry = await page.evaluate(() => ({ exporting: Creator.exporting, resultHidden: document.querySelector('#expResult').hidden,
      recordCount: window.testRecordCount, prepared: Creator.prepared, cache: AyahPlayer.cache.size, videoSrc: document.querySelector('#resultVideo').src }));
    assert(!retry.resultHidden && !retry.exporting && retry.prepared && retry.videoSrc.startsWith('blob:'));
    assert.equal(retry.recordCount, 1); assert.equal(retry.cache, 3); assert.equal(requests, 4); assert.deepEqual(pageErrors, []);
    console.log('Creator browser abort PASS: interrupted local request, no recording, successful synthetic retry');
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

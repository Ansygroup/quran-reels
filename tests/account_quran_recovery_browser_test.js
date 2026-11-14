'use strict';
/* Optional local Chromium test: account preview recovery; no real account or posting. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '../public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ttf': 'font/ttf', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname.startsWith('/api/')) { res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}'); return; }
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
  });
});
(async () => {
  let browser;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const { default: binary } = await import(pathToFileURL(require.resolve('@sparticuz/chromium')).href);
    browser = await chromium.launch({ executablePath: await binary.executablePath(), headless: true, args: [...binary.args, '--disable-gpu'] });
    const context = await browser.newContext({ viewport: { width: 900, height: 1200 }, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      let url; try { url = new URL(route.request().url()); } catch { return route.abort(); }
      return url.origin === origin ? route.continue() : route.abort();
    });
    const page = await context.newPage(), pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    await page.goto(origin, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => typeof Creator !== 'undefined' && Creator.ready && Quran.surahs.length === 114, null, { timeout: 60000 });
    let requests = 0;
    await page.route('**/data/quran-uthmani.json', route => {
      requests++;
      return requests === 1 ? route.fulfill({ status: 503, body: 'temporarily unavailable' }) : route.continue();
    });
    await page.evaluate(() => {
      window.testSelection = JSON.stringify({ s: Selection.surah, from: Selection.from, to: Selection.to });
      Quran.data = null; Quran.surahs = [];
      document.querySelector('#view-home').hidden = true; document.querySelector('#view-account').hidden = false;
      const app = window.PublishApp;
      app.available = [{ key: 'youtube', name: 'يوتيوب', publish: true }];
      app.connections = [{ platform: 'youtube' }];
      app.data = { config: { enabled: true, platforms: ['youtube'], template: { content_mode: 'mix', reciter_mode: 'rotate', background: 'rotate' } },
        options: { content_modes: ['mix', 'fixed'], reciters: [{ id: 'Alafasy_128kbps', name: 'مشاري العفاسي' }], backgrounds: ['rotate', 'grad-gold'] } };
      window.testApiCalls = 0; app.api = async () => { window.testApiCalls++; return { ok: true }; };
      app.renderAutoPanel(app.data);
    });
    await page.waitForFunction(() => document.querySelector('#acctPreviewNote')?.textContent.includes('تعذّر تحميل المعاينة'), null, { timeout: 10000 });
    const failed = await page.evaluate(() => ({ data: Quran.data, loading: Quran._loading, options: document.querySelector('#acctSurah').options.length }));
    assert.equal(failed.data, null); assert.equal(failed.loading, null); assert.equal(failed.options, 0); assert.equal(requests, 1);
    await page.locator('#acctCustomize > summary').click();
    assert.equal(await page.locator('#acctAppearance').evaluate(e => e.open), false);
    assert.match(await page.locator('#acctAppearanceSummary').innerText(), /تعذّر تحميل المعاينة/);
    // Retry through a visible control while appearance stays folded.
    await page.selectOption('#selContentMode', 'fixed');
    await page.waitForFunction(() => document.querySelector('#acctSurah')?.options.length === 114 &&
      !document.querySelector('#acctPreviewNote').textContent.includes('تعذّر'), null, { timeout: 15000 });
    const recovered = await page.evaluate(() => ({ n: Quran.surahs.length, text: Quran.ayah(1, 1), calls: window.testApiCalls,
      sameSelection: JSON.stringify({ s: Selection.surah, from: Selection.from, to: Selection.to }) === window.testSelection }));
    assert.equal(recovered.n, 114); assert(recovered.text.length > 0); assert.equal(recovered.calls, 0); assert(recovered.sameSelection);
    assert.equal(await page.locator('#acctAppearance').evaluate(e => e.open), false);
    assert.match(await page.locator('#acctAppearanceSummary').innerText(), /صورة الخلفية، الترجمة/);
    assert.equal(requests, 2); assert.deepEqual(pageErrors, []);
    console.log('Account preview PASS: local Quran fetch failure, visible warning, retry and recovery without saving or posting');
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

#!/usr/bin/env node
/* فحص مرئي محلي للصانع: شبكة خارجية محجوبة، ولا يتصل بأي حساب أو مزوّد. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright-core');
const chrome = require('@sparticuz/chromium').default;

const root = path.resolve(__dirname, '../public');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error, data) => {
    if (error) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(data);
  });
});

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const view = process.env.HOME_UI_VIEW || 'desktop';
    assert.ok(['desktop', 'tablet', 'mobile', 'small'].includes(view), 'invalid HOME_UI_VIEW');
    // تشغيل كل مقاس في عملية منفصلة يتجنب تعارض Chromium أحادي العملية.
    for (const [name, width, height] of [['desktop', 1440, 900], ['tablet', 768, 1024], ['mobile', 390, 844], ['small', 320, 700]].filter(([key]) => key === view)) {
      const browser = await chromium.launch({ executablePath: await chrome.executablePath(), args: chrome.args, headless: true });
      try {
        const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
        let writes = 0;
        const errors = [];
        await context.route('**/*', async (route) => {
          const request = route.request();
          const url = new URL(request.url());
          if (url.origin !== origin) return route.abort();
          if (url.pathname.startsWith('/api/')) {
            if (request.method() !== 'GET') writes++;
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ supabase: { url: '', anon: '' } }) });
          }
          return route.continue();
        });
        const page = await context.newPage();
        page.on('pageerror', (e) => errors.push(e.message));
        page.setDefaultTimeout(15000);
        await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelector('#selSurah')?.options.length === 114);
        const measurements = await page.evaluate(() => {
          const rect = (s) => document.querySelector(s).getBoundingClientRect();
          const out = [...document.querySelectorAll('#create *, .home-features *, #tools *, #library *, #steps *, #faq *')].filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && (r.left < -1 || r.right > window.innerWidth + 1);
          }).map(e => e.id || e.className || e.tagName);
          return { width: window.innerWidth, documentWidth: document.documentElement.scrollWidth, previewWidth: rect('.preview-col').width, overflow: out };
        });
        assert.equal(measurements.documentWidth, width, name + ': أفقي');
        assert.deepEqual(measurements.overflow, [], name + ': عناصر خارج الشاشة');
        if (width <= 560) assert.ok(measurements.previewWidth <= 220, 'المعاينة على الهاتف مضغوطة');
        await page.locator('#heroCreate').click();
        await page.waitForFunction(() => document.querySelector('#create').getBoundingClientRect().top < innerHeight);
        assert.equal(await page.locator('#stepTabs .step-tab').count(), 7);
        const originalSurah = await page.locator('#selSurah').inputValue();
        for (const key of ['msg', 'reciter', 'text', 'bg', 'trans', 'ded', 'style']) {
          await page.locator(`#stepTabs [data-pane="${key}"]`).click();
          assert.equal(await page.locator(`#pane-${key}`).isVisible(), true, key);
        }
        assert.equal(await page.locator('#selSurah').inputValue(), originalSurah);
        assert.equal(await page.locator('#btnCreate').isVisible(), true);
        assert.equal(await page.locator('#homeTools .tool-card').count(), 6);
        assert.equal(await page.locator('#library a').count(), 1);
        assert.equal(await page.locator('#library a').getAttribute('href'), '/articles/');
        assert.equal(await page.locator('#steps .step-card').count(), 4);
        assert.ok(await page.locator('#faqList .faq-item').count() >= 10);
        await page.locator('#faqList .faq-q').first().click();
        assert.equal(await page.locator('#faqList .faq-item').first().evaluate(e => e.classList.contains('open')), true);
        if (process.env.HOME_UI_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.HOME_UI_SCREENSHOTS, `${name}.png`), fullPage: true });
        await page.locator('#tools .tools-more a').click();
        await page.waitForFunction(() => !document.querySelector('#view-tools').hidden);
        const allToolCount = await page.evaluate(() => TOOLS.length);
        assert.ok(allToolCount >= 32);
        assert.equal(await page.locator('#toolsGridAll .tool-card').count(), allToolCount);
        const toolsMeasure = await page.evaluate(() => {
          const bad = [...document.querySelectorAll('#view-tools *')].filter(e => {
            const r = e.getBoundingClientRect();
            return r.width && r.height && (r.left < -1 || r.right > innerWidth + 1);
          }).map(e => e.id || e.className || e.tagName);
          return { documentWidth: document.documentElement.scrollWidth, bad };
        });
        assert.equal(toolsMeasure.documentWidth, width);
        assert.deepEqual(toolsMeasure.bad, []);
        if (process.env.TOOLS_UI_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.TOOLS_UI_SCREENSHOTS, `${name}-tools.png`), fullPage: true });
        const search = page.locator('#toolsSearch');
        assert.equal(await search.getAttribute('aria-describedby'), 'toolsResults');
        await search.fill('أذكار');
        await page.waitForFunction(() => document.querySelectorAll('#toolsGridAll .tool-card').length > 0 && document.querySelectorAll('#toolsGridAll .tool-card').length < TOOLS.length);
        assert.equal(await page.locator('#toolsClear').isVisible(), true);
        assert.match(await page.locator('#toolsResults').innerText(), /من/);
        await search.fill('baby-names');
        await page.waitForFunction(() => document.querySelectorAll('#toolsGridAll .tool-card').length === 1 && document.querySelector('#toolsGridAll a[href="#/tool/baby-names"]'));
        await search.fill('لا يوجد اسم بهذا الشكل مطلقا');
        await page.waitForFunction(() => !document.querySelector('#toolsEmpty').hidden);
        assert.equal(await page.locator('#toolsGridAll .tool-card').count(), 0);
        await page.locator('#toolsClear').click();
        await page.waitForFunction(() => document.querySelectorAll('#toolsGridAll .tool-card').length === TOOLS.length && document.querySelector('#toolsEmpty').hidden);
        assert.equal(await search.inputValue(), '');
        assert.equal(await search.evaluate(e => document.activeElement === e), true);
        await page.locator('#toolsGridAll a[href="#/tool/tasbeeh"]').click();
        await page.waitForSelector('#toolMount [data-tap]');
        await page.locator('#toolMount [data-tap]').click();
        assert.match(await page.locator('#toolMount [data-count]').innerText(), /١|1/);
        await page.locator('.tool-back').click();
        await page.waitForFunction(() => !document.querySelector('#view-tools').hidden);
        assert.equal(await page.locator('#toolsGridAll .tool-card').count(), allToolCount);
        assert.equal(writes, 0);
        assert.deepEqual(errors, []);
        console.log(`OK ${name}: ${JSON.stringify(measurements)}, 7 tabs, 6 featured tools, search/clear, tool interaction, FAQ, no writes or page errors`);
      } finally { await browser.close(); }
    }
  } finally { server.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

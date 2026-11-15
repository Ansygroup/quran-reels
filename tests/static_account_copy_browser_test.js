/* Static content on mobile/desktop, all requests contained to local fixture server. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), http = require('node:http'), path = require('node:path');
const { chromium } = require('playwright-core'), chrome = require('@sparticuz/chromium').default;
const root = path.resolve(__dirname, '../public');
const server = http.createServer((req, res) => {
  let pathname = new URL(req.url, 'http://local').pathname;
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (err, data) => err ? res.writeHead(404).end() : res.writeHead(200, {'Content-Type': ({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript'})[path.extname(file)] || 'application/octet-stream'}).end(data));
});
(async () => { let browser; try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: await chrome.executablePath(), args: chrome.args, headless: true });
  const ctx = await browser.newContext({ viewport: {width: Number(process.env.REEL_TEST_WIDTH || 390), height: 844}, serviceWorkers: 'block' });
  await ctx.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
  const page = await ctx.newPage();
  await page.goto(origin + '/faq/');
  assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
  assert.match(await page.locator('main').innerText(), /الأتمتة تعمل على الخادم/);
  assert.match(await page.locator('main').innerText(), /تيليجرام وواتساب غير متاح/);
  await page.goto(origin + '/blog/schedule-quran-reels/');
  assert.match(await page.locator('main').innerText(), /04:15 UTC/);
  assert.match(await page.locator('main').innerText(), /قد يؤدي الربط إلى تفعيل الأتمتة/);
  assert.equal(await page.getByRole('link', {name:'افتح صفحة الحساب'}).getAttribute('href'), '/#/account');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'schedule page must not overflow viewport');
  await ctx.close();
  console.log(`ALL OK: static account copy at ${process.env.REEL_TEST_WIDTH || 390}px, local fixtures only`);
} finally { if (browser) await browser.close(); server.close(); } })().catch(err => { console.error(err); server.close(); process.exitCode = 1; });

/* Real Chromium service worker with a local synthetic site, no external network. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), http = require('node:http'), path = require('node:path');
const { chromium } = require('playwright-core'), chrome = require('@sparticuz/chromium').default;
const sw = fs.readFileSync(path.join(__dirname, '../public/sw.js'));
let rootMode = 'normal', rootText = 'HOME-INITIAL';
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  res.setHeader('Cache-Control', 'no-store');
  if (u.pathname === '/sw.js') return res.writeHead(200, {'Content-Type':'application/javascript'}).end(sw);
  if (u.pathname === '/setup/') return res.writeHead(200, {'Content-Type':'text/html'}).end('<h1>SETUP</h1>');
  if (u.pathname === '/faq/') return res.writeHead(200, {'Content-Type':'text/html'}).end('<h1>FAQ-PAGE</h1>');
  if (u.pathname === '/') {
    if (u.search) return res.writeHead(200, {'Content-Type':'text/html'}).end('<h1>QUERY-PRIVATE</h1>');
    if (rootMode === 'error') return res.writeHead(503, {'Content-Type':'text/html'}).end('<h1>ERROR-PAGE</h1>');
    if (rootMode === 'redirect') return res.writeHead(302, {Location:'/faq/'}).end();
    if (rootMode === 'json') return res.writeHead(200, {'Content-Type':'application/json'}).end('{"wrong":"DOCUMENT"}');
    return res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}).end(`<h1>${rootText}</h1>`);
  }
  if (/^\/(?:js|css|data|img)\//.test(u.pathname) || u.pathname === '/manifest.json') return res.writeHead(rootMode === 'error' ? 404 : 200, {'Content-Type':'text/plain'}).end('synthetic asset');
  return res.writeHead(404, {'Content-Type':'text/plain'}).end('not found');
});
(async () => { let browser; try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({executablePath: await chrome.executablePath(), args: [...chrome.args.filter(a => a !== '--single-process'), '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'], headless: true});
  async function setup() {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(origin + '/setup/');
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/sw.js');
      await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(Error('service worker activation timeout: ' + [registration.installing?.state, registration.waiting?.state, registration.active?.state].join(','))), 12000))]);
    });
    // Existing page may have opened before activation; reload to acquire control.
    await page.reload();
    assert(await page.evaluate(() => !!navigator.serviceWorker.controller), 'fixture page controlled by service worker');
    return {ctx, page};
  }
  const getShell = page => page.evaluate(async () => {const c = await caches.open('qr-v78'); const r = await c.match('/'); return r ? r.text() : null;});
  const offlineFailure = async (page, url) => { let failed = false; try { await page.goto(url); } catch { failed = true; } assert(failed, 'navigation should fail instead of displaying an unrelated shell'); };
  // An install served an error must not save it as a shell.
  rootMode = 'error';
  { const {ctx,page} = await setup(); assert.equal(await getShell(page), null); await ctx.setOffline(true); await offlineFailure(page, origin + '/'); await ctx.close(); }
  // Valid install, navigations to unrelated, query, error, redirect and non-HTML responses.
  rootMode = 'normal'; rootText = 'HOME-INITIAL';
  { const {ctx,page} = await setup();
    assert.match(await getShell(page), /HOME-INITIAL/);
    await page.goto(origin + '/faq/'); assert.match(await page.locator('h1').innerText(), /FAQ-PAGE/); assert.match(await getShell(page), /HOME-INITIAL/);
    await page.goto(origin + '/?code=secret'); assert.match(await page.locator('h1').innerText(), /QUERY-PRIVATE/); assert.match(await getShell(page), /HOME-INITIAL/);
    rootMode = 'error'; assert.equal((await page.goto(origin + '/')).status(), 503); assert.match(await getShell(page), /HOME-INITIAL/);
    rootMode = 'redirect'; await page.goto(origin + '/'); assert.match(await page.locator('h1').innerText(), /FAQ-PAGE/); assert.match(await getShell(page), /HOME-INITIAL/);
    rootMode = 'json'; await page.goto(origin + '/'); assert.match(await getShell(page), /HOME-INITIAL/);
    rootMode = 'normal'; rootText = 'HOME-UPDATED'; await page.goto(origin + '/');
    // Wait for the background cache write, which is protected by waitUntil.
    const deadline = Date.now() + 5000; let shell;
    do { shell = await getShell(page); if (shell?.includes('HOME-UPDATED')) break; await new Promise(resolve => setTimeout(resolve, 25)); } while (Date.now() < deadline);
    assert.match(shell, /HOME-UPDATED/);
    await ctx.setOffline(true);
    const secondPage = await ctx.newPage(); await secondPage.goto(origin + '/#/account');
    assert.match(await secondPage.locator('h1').innerText(), /HOME-UPDATED/);
    await offlineFailure(secondPage, origin + '/faq/');
    await ctx.close();
  }
  console.log('ALL OK: real service worker install and navigation preserve valid shell; static offline pages fail rather than show homepage');
} finally {if (browser) await browser.close(); server.close();} })().catch(e => {console.error(e); server.close(); process.exitCode = 1;});

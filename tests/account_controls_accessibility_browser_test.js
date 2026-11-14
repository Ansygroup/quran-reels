/* Real Chromium with synthetic account; external network and API blocked. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), http = require('node:http'), path = require('node:path');
const { chromium } = require('playwright-core'), chrome = require('@sparticuz/chromium').default;
const root = path.resolve(__dirname, '../public');
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost'); if (u.pathname.startsWith('/api/')) return res.writeHead(403).end();
  const file = path.resolve(root, '.' + (u.pathname === '/' ? '/index.html' : u.pathname));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (err, data) => err ? res.writeHead(404).end() : res.writeHead(200, { 'Content-Type': ({ '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' }).end(data));
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: await chrome.executablePath(), args: chrome.args, headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: Number(process.env.REEL_TEST_WIDTH || 390), height: 844 }, serviceWorkers: 'block' });
    await ctx.route('**/*', r => r.request().url().startsWith(origin + '/') ? r.continue() : r.abort());
    const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => typeof Creator !== 'undefined' && Creator.ready);
    await page.evaluate(() => {
      document.querySelector('#view-home').hidden = true; document.querySelector('#view-account').hidden = false; document.querySelector('#cookieBar').hidden = true;
      const a = PublishApp; a._accountOwner = 'owner'; a._connectionsState = 'loaded';
      a.connections = [{ id:'one',platform:'youtube',account_name:'أولى',is_default:true,has_refresh:true }, { id:'two',platform:'youtube',account_name:'ثانية',is_default:false,has_refresh:true }];
      a.available = [{ key:'youtube',name:'يوتيوب',publish:true,ready:true }];
      a.data = { config:{ settings_revision:'11111111-1111-4111-8111-111111111111',enabled:false,platforms:['youtube'],all_channels:false,template:{content_mode:'mix',background:'rotate'} }, available:a.available,options:{content_modes:['mix','fixed'],backgrounds:['rotate'],reciters:[]},runs:[],stats:{published:0,scheduled:0,failed:0} };
      a.renderAccount(a.data); a.bindEvents();
    });
    await page.locator('#acctCustomize > summary').focus(); await page.keyboard.press('Enter');
    const group = page.getByRole('group', { name:'المنصات التي يُنشر عليها', exact:true });
    assert.equal(await group.count(), 1, 'platform choices have an accessible group name');
    assert.equal(await group.getByRole('checkbox', { name:'يوتيوب', exact:true }).count(), 1);
    const all = page.getByRole('checkbox', { name:'انشر على كل القنوات المرتبطة', exact:true });
    assert.equal(await all.count(), 1, 'multi-channel checkbox has an accessible name');
    const description = await all.getAttribute('aria-describedby'); assert(description);
    assert.match(await page.locator('#' + description).innerText(), /قد تختار المهمة بلا قناة محددة الافتراضية وقت النشر/);
    assert.equal(await all.isChecked(), false);
    await group.getByRole('checkbox', { name:'يوتيوب', exact:true }).focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'chkAllChannels', 'Tab reaches the multi-channel switch');
    await page.keyboard.press('Space'); assert.equal(await all.isChecked(), true);
    assert.equal(await page.locator('#acctDraftBadge').isVisible(), true, 'keyboard change is a draft, not an automatic save');
    assert.match(await page.locator('#acctEditState').innerText(), /غير محفوظة/);
    const outline = await all.evaluate(e => getComputedStyle(e.nextElementSibling).outlineStyle);
    assert.notEqual(outline, 'none', 'keyboard focus is visibly indicated on the switch');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []); await ctx.close();
    console.log('PASS accessible multi-channel control, platform group, keyboard change and draft state (mock browser)');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
